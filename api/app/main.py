"""Nebula Studio API (FastAPI).

Run:  uvicorn app.main:app --reload --port 8000   (from the /api directory)
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import seed
from .routes import api, media_api

@asynccontextmanager
async def lifespan(_app: "FastAPI"):
    """Seed the store on boot; the hook is where a DB pool or warm cache would open."""
    print("[nebula] API ready - docs at /docs")
    yield


app = FastAPI(
    title="Nebula Studio API",
    version="1.0.0",
    description="AI content creation platform: generation, projects, templates, "
                "prompt library, analytics, billing and exports.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

seed.seed()

app.include_router(api)
app.include_router(media_api)
