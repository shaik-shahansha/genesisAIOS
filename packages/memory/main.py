"""
Genesis Memory Service
FastAPI + ChromaDB vector memory using the built-in ONNX MiniLM embeddings
(no PyTorch / sentence-transformers needed — runs on CPU, ~80 MB model).
"""

import os
import json
import logging
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("genesis.memory")

CHROMA_PATH = os.getenv("CHROMA_PATH", "./data/chroma")
COLLECTION_NAME = "genesis_messages"
PROFILE_PATH = os.path.join(CHROMA_PATH, "user_profile.json")

chroma_client = None
collection = None


def _load_profile() -> dict:
    """Load user profile from disk; returns empty dict if not found."""
    try:
        if os.path.exists(PROFILE_PATH):
            with open(PROFILE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_profile(profile: dict):
    os.makedirs(os.path.dirname(PROFILE_PATH), exist_ok=True)
    with open(PROFILE_PATH, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2, ensure_ascii=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global chroma_client, collection
    import chromadb
    from chromadb.utils import embedding_functions

    logger.info(f"Connecting to ChromaDB at {CHROMA_PATH}")
    chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)

    # Use ChromaDB's built-in ONNX MiniLM-L6 embedding function
    # Downloads ~80 MB ONNX model on first run, no PyTorch required
    ef = embedding_functions.ONNXMiniLM_L6_V2()

    collection = chroma_client.get_or_create_collection(
        COLLECTION_NAME,
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )
    logger.info(f"Memory service ready — {collection.count()} entries in store")

    # Re-index the user profile into ChromaDB so it's always searchable
    profile = _load_profile()
    if profile:
        profile_text = "\n".join(f"{k}: {v}" for k, v in profile.items())
        collection.upsert(
            ids=["__user_profile__"],
            documents=[profile_text],
            metadatas=[{"role": "user_profile", "pinned": "true"}],
        )
        logger.info("User profile re-indexed into ChromaDB")

    yield
    logger.info("Memory service shutting down")


app = FastAPI(title="Genesis Memory Service", lifespan=lifespan)


# ── Request/response models ────────────────────────────────────────────────────

class StoreRequest(BaseModel):
    id: str
    role: str
    content: str


class SearchRequest(BaseModel):
    query: str
    n_results: int = 8


class ProfileUpdateRequest(BaseModel):
    facts: Dict[str, Any]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/store")
async def store(req: StoreRequest):
    if not req.content.strip():
        return {"ok": False, "reason": "empty content"}
    try:
        collection.upsert(
            ids=[req.id],
            documents=[req.content],
            metadatas=[{"role": req.role}],
        )
        return {"ok": True}
    except Exception as e:
        logger.error(f"Store error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search")
async def search(req: SearchRequest) -> dict:
    if not collection or collection.count() == 0:
        return {"results": []}
    try:
        # Cap n_results at the number of documents available
        n = min(req.n_results, collection.count())
        results = collection.query(
            query_texts=[req.query],
            n_results=n,
            include=["documents", "metadatas", "distances"],
        )
        items: List[dict] = []
        for i, doc in enumerate(results["documents"][0]):
            meta = results["metadatas"][0][i]
            items.append(
                {
                    "content": doc,
                    "role": meta.get("role", ""),
                    "distance": results["distances"][0][i],
                    "pinned": meta.get("pinned") == "true",
                }
            )
        # Always put pinned items (user_profile) first
        items.sort(key=lambda x: (0 if x["pinned"] else 1, x["distance"]))
        return {"results": items}
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── User profile endpoints ────────────────────────────────────────────────────

@app.get("/profile")
async def get_profile():
    """Return the persistent user identity profile."""
    return {"profile": _load_profile()}


@app.post("/profile")
async def update_profile(req: ProfileUpdateRequest):
    """Merge new facts into the user profile and re-index in ChromaDB."""
    profile = _load_profile()
    profile.update(req.facts)
    _save_profile(profile)

    # Keep ChromaDB in sync so profile is always searchable
    profile_text = "\n".join(f"{k}: {v}" for k, v in profile.items())
    try:
        collection.upsert(
            ids=["__user_profile__"],
            documents=[profile_text],
            metadatas=[{"role": "user_profile", "pinned": "true"}],
        )
    except Exception as e:
        logger.warning(f"Profile ChromaDB upsert failed: {e}")

    logger.info(f"User profile updated: {list(req.facts.keys())}")
    return {"ok": True, "profile": profile}


@app.delete("/clear")
async def clear():
    try:
        chroma_client.delete_collection(COLLECTION_NAME)
        global collection
        from chromadb.utils import embedding_functions
        ef = embedding_functions.ONNXMiniLM_L6_V2()
        collection = chroma_client.get_or_create_collection(
            COLLECTION_NAME,
            embedding_function=ef,
            metadata={"hnsw:space": "cosine"},
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"ok": True, "count": collection.count() if collection else 0}
