from __future__ import annotations

import asyncio
from contextlib import suppress
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import models as _models  # noqa: F401
from app.agents.provider import ProviderUnavailableError, get_requirement_provider
from app.parsers.ocr import get_ocr_adapter
from app.api.routes import router
from app.api.domain_routes import router as domain_router
from app.api.auth_routes import router as auth_router
from app.api.agent_routes import router as agent_router
from app.auth.dependencies import Principal, get_principal
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine, get_db
from app.services.seed import seed_demo
from app.services.local_workspace import bootstrap_local_workspace
from app.services.jobs import process_next_job


async def _local_worker(stop: asyncio.Event) -> None:
    """Consume durable jobs without blocking the FastAPI event loop."""
    while not stop.is_set():
        processed = await asyncio.to_thread(process_next_job)
        try:
            await asyncio.wait_for(stop.wait(), timeout=0.1 if processed else 0.5)
        except TimeoutError:
            pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    if settings.desktop_mode:
        if settings.app_data_dir is None:
            raise RuntimeError("desktop application data directory is not configured")
        for directory in ("artifacts", "exports", "logs", "backups"):
            (settings.app_data_dir / directory).mkdir(parents=True, exist_ok=True)
        with Session(bind=engine) as db:
            bootstrap_local_workspace(db, settings)
    stop = asyncio.Event()
    worker = asyncio.create_task(_local_worker(stop)) if settings.local_worker_enabled else None
    try:
        yield
    finally:
        stop.set()
        if worker is not None:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker


app = FastAPI(title="BidEvidence API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=(
        ["Content-Type", "Authorization"]
        if get_settings().desktop_mode
        else ["Content-Type", "Authorization", "X-Tenant-ID", "X-User-ID", "X-Role"]
    ),
)
app.include_router(router)
app.include_router(domain_router)
app.include_router(auth_router)
app.include_router(agent_router)


@app.get("/health")
def health() -> dict:
    settings = get_settings()
    try:
        provider = get_requirement_provider(settings.llm_provider)
        provider_status = "available"
        provider_model = provider.model
    except ProviderUnavailableError:
        provider_status = "unavailable"
        provider_model = None
    ocr_adapter = get_ocr_adapter(settings.ocr_mode, settings.ocr_languages)
    ocr_status = (
        "disabled"
        if settings.ocr_mode == "disabled"
        else "available"
        if ocr_adapter
        else "unavailable"
    )
    return {
        "status": "ok",
        "service": "bidevidence-api",
        "version": "0.1.0",
        "llm_provider": settings.llm_provider,
        "llm_provider_status": provider_status,
        "llm_model": provider_model,
        "ocr_mode": settings.ocr_mode,
        "ocr_status": ocr_status,
        "ocr_engine": ocr_adapter.name if ocr_adapter else None,
        "mode": "desktop" if settings.desktop_mode else "server",
    }


@app.post("/api/dev/seed")
def seed(db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> dict:
    if get_settings().desktop_mode:
        raise HTTPException(status_code=404, detail="demo seed is unavailable in desktop mode")
    if principal.role != "admin":
        raise HTTPException(status_code=403, detail="admin permission required")
    return seed_demo(db)
