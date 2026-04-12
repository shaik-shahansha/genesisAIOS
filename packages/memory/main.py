"""
Genesis Memory Service
FastAPI + ChromaDB vector memory using the built-in ONNX MiniLM embeddings
(no PyTorch / sentence-transformers needed — runs on CPU, ~80 MB model).
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("genesis.memory")

CHROMA_PATH = os.getenv("CHROMA_PATH", "./data/chroma")
COLLECTION_NAME = "genesis_messages"

chroma_client = None
collection = None


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
    n_results: int = 5


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
    if collection.count() == 0:
        return {"results": []}
    try:
        n = min(req.n_results, collection.count())
        results = collection.query(
            query_texts=[req.query],
            n_results=n,
            include=["documents", "metadatas", "distances"],
        )
        items: List[dict] = []
        for i, doc in enumerate(results["documents"][0]):
            items.append(
                {
                    "content": doc,
                    "role": results["metadatas"][0][i].get("role", ""),
                    "distance": results["distances"][0][i],
                }
            )
        return {"results": items}
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
