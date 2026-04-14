"""
Genesis Voice Service
FastAPI sidecar providing:
    POST /transcribe  — audio (webm/wav/mp3) → text via faster-whisper + Silero VAD
    POST /tts         — text → WAV audio via kokoro (82M Apache TTS model)
    GET  /health      — liveness check and model readiness
"""

import asyncio
import ssl
import io
import os
import logging
import tempfile
import shutil
from pathlib import Path
from contextlib import asynccontextmanager

SYSTEM_CA_BUNDLE = "/etc/ssl/certs/ca-certificates.crt"
os.environ.setdefault("SSL_CERT_FILE", SYSTEM_CA_BUNDLE)
os.environ.setdefault("REQUESTS_CA_BUNDLE", SYSTEM_CA_BUNDLE)
os.environ.setdefault("CURL_CA_BUNDLE", SYSTEM_CA_BUNDLE)
ALLOW_INSECURE_TLS = os.getenv("GENESIS_ALLOW_INSECURE_TLS", "false").lower() == "true"

try:
    import truststore

    truststore.inject_into_ssl()
except Exception:
    truststore = None

if ALLOW_INSECURE_TLS:
    ssl._create_default_https_context = ssl._create_unverified_context

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.responses import Response
import httpx

try:
    import huggingface_hub as hf_hub

    if ALLOW_INSECURE_TLS:
        logger = logging.getLogger("genesis.voice")

        hf_hub.set_client_factory(lambda: httpx.Client(verify=False, timeout=120.0))
        hf_hub.set_async_client_factory(lambda: httpx.AsyncClient(verify=False, timeout=120.0))
        logger.warning("GENESIS_ALLOW_INSECURE_TLS=true — disabling TLS verification for Hugging Face downloads")
except Exception:
    hf_hub = None

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("genesis.voice")

WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
KOKORO_VOICE = os.getenv("KOKORO_VOICE", "bf_emma")
KOKORO_REPO_ID = os.getenv("KOKORO_REPO_ID", "hexgrad/Kokoro-82M")

whisper_model = None
kokoro_pipeline = None
model_status = {
    "whisper": {"ready": False, "loading": False, "error": None},
    "tts": {"ready": False, "loading": False, "error": None},
}
startup_task = None


def cleanup_stale_hf_artifacts() -> None:
    hf_home = Path(os.getenv("HF_HOME", "/data/hf_cache"))
    if not hf_home.exists():
        return

    removed = 0
    for pattern in ("*.lock", "*.incomplete"):
        for file_path in hf_home.rglob(pattern):
            try:
                file_path.unlink()
                removed += 1
            except OSError:
                continue

    if removed:
        logger.info("Removed %s stale Hugging Face cache artifact(s)", removed)


def cleanup_voice_cache_artifacts(voice: str) -> int:
    hf_home = Path(os.getenv("HF_HOME", "/data/hf_cache"))
    if not hf_home.exists() or not voice:
        return 0

    removed = 0
    voice_file = f"{voice}.pt"
    for file_path in hf_home.rglob("*"):
        if not file_path.is_file():
            continue
        path_str = str(file_path).replace("\\", "/")
        name = file_path.name
        if name == voice_file or f"voices/{voice}.pt" in path_str:
            try:
                file_path.unlink()
                removed += 1
            except OSError:
                continue

    if removed:
        logger.warning("Removed %s cached artifact(s) for voice %s", removed, voice)
    return removed


def should_retry_tts_error(error: Exception) -> bool:
    message = str(error)
    retry_markers = (
        "Consistency check failed",
        "file should be of size",
        "ReadError",
        "Checksum",
    )
    return any(marker in message for marker in retry_markers)


def ensure_kokoro_voice(voice: str, force_download: bool = False) -> str | None:
    hf_home = Path(os.getenv("HF_HOME", "/data/hf_cache"))
    voice_dir = hf_home / "manual_voices"
    voice_dir.mkdir(parents=True, exist_ok=True)
    voice_path = voice_dir / f"{voice}.pt"

    if voice_path.exists() and not force_download:
        logger.info("Kokoro voice ready from local cache: %s", voice_path)
        return str(voice_path)

    temp_path = voice_path.with_suffix(".pt.tmp")
    if temp_path.exists():
        temp_path.unlink(missing_ok=True)
    if force_download and voice_path.exists():
        voice_path.unlink(missing_ok=True)

    url = f"https://huggingface.co/{KOKORO_REPO_ID}/resolve/main/voices/{voice}.pt?download=1"
    timeout = httpx.Timeout(120.0, connect=30.0)
    client_kwargs = {"follow_redirects": True, "timeout": timeout}
    if ALLOW_INSECURE_TLS:
        client_kwargs["verify"] = False

    with httpx.Client(**client_kwargs) as client:
        with client.stream("GET", url) as response:
            response.raise_for_status()
            expected_size = int(response.headers.get("content-length", "0") or "0")
            written = 0
            with open(temp_path, "wb") as handle:
                for chunk in response.iter_bytes():
                    if not chunk:
                        continue
                    handle.write(chunk)
                    written += len(chunk)

    if expected_size and written != expected_size:
        temp_path.unlink(missing_ok=True)
        raise ValueError(f"Downloaded voice size mismatch for {voice}: expected {expected_size}, got {written}")

    if written < 100_000:
        temp_path.unlink(missing_ok=True)
        raise ValueError(f"Downloaded voice file for {voice} is unexpectedly small ({written} bytes)")

    shutil.move(str(temp_path), str(voice_path))
    logger.info("Kokoro voice downloaded: %s (%s bytes)", voice_path, written)
    return str(voice_path)


def _load_whisper_model() -> None:
    global whisper_model

    model_status["whisper"] = {"ready": False, "loading": True, "error": None}
    try:
        from faster_whisper import WhisperModel

        logger.info(f"Loading Whisper model: {WHISPER_MODEL_SIZE}")
        whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
        model_status["whisper"] = {"ready": True, "loading": False, "error": None}
        logger.info("Whisper model ready")
    except Exception as e:
        whisper_model = None
        model_status["whisper"] = {"ready": False, "loading": False, "error": str(e)}
        logger.error(f"Failed to load Whisper: {e}")


def _load_kokoro_pipeline() -> None:
    global kokoro_pipeline

    model_status["tts"] = {"ready": False, "loading": True, "error": None}
    try:
        from kokoro import KPipeline

        logger.info("Loading Kokoro TTS pipeline...")
        kokoro_pipeline = KPipeline(lang_code="a")
        model_status["tts"] = {"ready": True, "loading": False, "error": None}
        logger.info("Kokoro TTS ready")
    except Exception as e:
        kokoro_pipeline = None
        model_status["tts"] = {"ready": False, "loading": False, "error": str(e)}
        logger.warning(f"Kokoro TTS not available: {e}. /tts will return 503.")


async def initialize_models() -> None:
    await asyncio.to_thread(cleanup_stale_hf_artifacts)
    await asyncio.gather(
        asyncio.to_thread(_load_whisper_model),
        asyncio.to_thread(_load_kokoro_pipeline),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global startup_task

    startup_task = asyncio.create_task(initialize_models())
    logger.info("Voice models loading in background")

    yield

    if startup_task and not startup_task.done():
        startup_task.cancel()
    logger.info("Voice service shutting down")


app = FastAPI(title="Genesis Voice Service", lifespan=lifespan)


# ── STT: transcribe audio ─────────────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    if not whisper_model:
        detail = model_status["whisper"]["error"] or "Whisper STT not ready"
        raise HTTPException(status_code=503, detail=detail)
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    try:
        suffix = ".webm"
        if audio.content_type:
            if "mp3" in audio.content_type:
                suffix = ".mp3"
            elif "wav" in audio.content_type:
                suffix = ".wav"
            elif "ogg" in audio.content_type:
                suffix = ".ogg"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(data)
            tmp_path = f.name

        segments, info = whisper_model.transcribe(
            tmp_path,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            language="en",
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        os.unlink(tmp_path)
        return {"text": text, "language": info.language}
    except Exception as e:
        logger.error(f"Transcribe error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Raw audio body variant (used when Content-Type is audio/* directly)
@app.post("/transcribe-raw")
async def transcribe_raw(request: Request):
    if not whisper_model:
        detail = model_status["whisper"]["error"] or "Whisper STT not ready"
        raise HTTPException(status_code=503, detail=detail)
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    content_type = request.headers.get("content-type", "audio/webm")
    try:
        suffix = ".webm"
        if "mp3" in content_type:
            suffix = ".mp3"
        elif "wav" in content_type:
            suffix = ".wav"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(data)
            tmp_path = f.name

        segments, info = whisper_model.transcribe(
            tmp_path,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            language="en",
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        os.unlink(tmp_path)
        return {"text": text, "language": info.language}
    except Exception as e:
        logger.error(f"Transcribe-raw error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── TTS: text to speech ───────────────────────────────────────────────────────

@app.post("/tts")
async def tts(request: Request):
    body = await request.json()
    text = body.get("text", "").strip()
    voice = body.get("voice", KOKORO_VOICE)

    if not text:
        raise HTTPException(status_code=400, detail="text required")
    if not kokoro_pipeline:
        detail = model_status["tts"]["error"] or "Kokoro TTS not available"
        raise HTTPException(status_code=503, detail=detail)

    try:
        voice_source = await asyncio.to_thread(ensure_kokoro_voice, voice, False)
    except Exception as e:
        voice_source = voice
        logger.warning("Kokoro voice warmup failed for %s: %s", voice, e)

    def synthesize_audio(voice_input: str) -> bytes:
        import numpy as np
        import soundfile as sf

        chunks = []
        for _, _, audio in kokoro_pipeline(text, voice=voice_input, speed=1.0, split_pattern=r"[.!?]\s+"):
            if audio is not None:
                chunks.append(audio)

        if not chunks:
            raise ValueError("Kokoro produced no audio output")

        audio_data = np.concatenate(chunks)
        buf = io.BytesIO()
        sf.write(buf, audio_data, 24000, format="WAV")
        buf.seek(0)
        return buf.read()

    try:
        audio_bytes = await asyncio.to_thread(synthesize_audio, voice_source)
        return Response(content=audio_bytes, media_type="audio/wav")
    except Exception as e:
        if should_retry_tts_error(e):
            await asyncio.to_thread(cleanup_voice_cache_artifacts, voice)
            await asyncio.to_thread(cleanup_stale_hf_artifacts)
            logger.warning("Retrying Kokoro TTS after force-refresh for voice %s", voice)
            try:
                voice_source = await asyncio.to_thread(ensure_kokoro_voice, voice, True)
                audio_bytes = await asyncio.to_thread(synthesize_audio, voice_source)
                return Response(content=audio_bytes, media_type="audio/wav")
            except Exception as retry_error:
                logger.error(f"TTS retry failed for voice {voice}: {retry_error}")
                raise HTTPException(status_code=500, detail=str(retry_error))

        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {
        "ok": True,
        "whisper": whisper_model is not None,
        "tts": kokoro_pipeline is not None,
        "whisper_loading": model_status["whisper"]["loading"],
        "tts_loading": model_status["tts"]["loading"],
        "whisper_error": model_status["whisper"]["error"],
        "tts_error": model_status["tts"]["error"],
    }
