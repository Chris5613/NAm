"""
Stub backend.

This application is fully client-side (React + localStorage). The frontend does
not call this server for any business logic. We keep this minimal FastAPI app
solely so supervisor has a healthy process to manage on port 8001 (since the
supervisor configuration is read-only in this environment).

If you ever decide to bring back server-side persistence, this is a safe place
to start. For now it only exposes a couple of harmless health endpoints under
the required `/api` prefix.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Net Worth Tracker - Stub Backend", version="0.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/")
async def root() -> dict[str, str]:
    return {
        "status": "ok",
        "message": "App is fully client-side. This stub backend is intentionally empty.",
    }


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
