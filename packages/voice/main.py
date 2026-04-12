"""
Genesis Voice Service
FastAPI sidecar providing:
  POST /transcribe  — audio (webm/wav/mp3) → text via faster-whisper + Silero VAD
  POST /tts         — text → WAV audio via kokoro (82M Apache TTS model)
  GET  /health      — liveness check
"""

import io
import os
import logging
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.responses import Response

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("genesis.voice")

WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL", "tiny")
KOKORO_VOICE = os.getenv("KOKORO_VOICE", "bf_emma")

whisper_model = None
kokoro_pipeline = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global whisper_model, kokoro_pipeline

    # ── Load STT model ────────────────────────────────────────────────────────
    try:
        from faster_whisper import WhisperModel
        logger.info(f"Loading Whisper model: {WHISPER_MODEL_SIZE}")
        whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
        logger.info("Whisper model ready")
    except Exception as e:
        logger.error(f"Failed to load Whisper: {e}")

    # ── Load TTS model ────────────────────────────────────────────────────────
    try:
        from kokoro import KPipeline
        logger.info("Loading Kokoro TTS pipeline...")
        kokoro_pipeline = KPipeline(lang_code="a")   # 'a' = American English
        logger.info("Kokoro TTS ready")
    except Exception as e:
        logger.warning(f"Kokoro TTS not available: {e}. /tts will return 503.")

    yield
    logger.info("Voice service shutting down")


app = FastAPI(title="Genesis Voice Service", lifespan=lifespan)


# ── STT: transcribe audio ─────────────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    if not whisper_model:
        raise HTTPException(status_code=503, detail="Whisper STT not ready")
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
        raise HTTPException(status_code=503, detail="Whisper STT not ready")
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
        raise HTTPException(status_code=503, detail="Kokoro TTS not available")

    try:
        import numpy as np
        import soundfile as sf

        chunks = []
        for _, _, audio in kokoro_pipeline(text, voice=voice, speed=1.0, split_pattern=r"[.!?]\s+"):
            if audio is not None:
                chunks.append(audio)

        if not chunks:
            raise ValueError("Kokoro produced no audio output")

        audio_data = np.concatenate(chunks)
        buf = io.BytesIO()
        sf.write(buf, audio_data, 24000, format="WAV")
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/wav")
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {
        "ok": True,
        "whisper": whisper_model is not None,
        "tts": kokoro_pipeline is not None,
    }
