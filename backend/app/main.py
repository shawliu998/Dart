from __future__ import annotations

import asyncio
from contextlib import suppress
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app import models as _models  # noqa: F401
from app.agents.provider import ProviderUnavailableError, get_requirement_provider
from app.parsers.ocr import get_ocr_adapter
from app.api.routes import router
from app.api.domain_routes import router as domain_router
from app.api.auth_routes import router as auth_router
from app.api.agent_routes import router as agent_router
from app.api.settings_routes import router as settings_router
from app.audit.context import bind_http_request_id, reset_http_request_id
from app.auth.dependencies import Principal, get_principal
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine, get_db
from app.services.seed import seed_demo
from app.services.local_workspace import bootstrap_local_workspace
from app.services.jobs import process_next_job
from uuid import UUID, uuid4


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

_API_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
_SWAGGER_CSP = (
    "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; "
    "connect-src 'self'; img-src 'self' data: https://fastapi.tiangolo.com; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' https://cdn.jsdelivr.net"
)
_REDOC_CSP = (
    "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; "
    "connect-src 'self'; img-src 'self' data: https://cdn.redoc.ly https://fastapi.tiangolo.com; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
    "worker-src 'self' blob:"
)


def apply_security_headers(response: Response, path: str) -> Response:
    """Add baseline browser protections without breaking FastAPI's local docs."""
    csp = _SWAGGER_CSP if path == "/docs" else _REDOC_CSP if path == "/redoc" else _API_CSP
    response.headers.setdefault("Content-Security-Policy", csp)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
    return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply baseline browser protections to every API response.

    API routes deny all subresources. FastAPI's documentation pages receive a
    narrower policy that permits only their known CDN assets and same-origin
    OpenAPI request.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        return apply_security_headers(response, request.url.path)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Generate an untrusted-client-independent ID for every HTTP request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = uuid4()
        request.state.request_id = request_id
        token = bind_http_request_id(request_id)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = str(request_id)
            return response
        finally:
            reset_http_request_id(token)


async def internal_server_error(request: Request, _: Exception) -> Response:
    """Keep 500 responses generic and protected when they bypass middleware."""
    response = apply_security_headers(
        JSONResponse(status_code=500, content={"detail": "internal server error"}), request.url.path
    )
    origin = request.headers.get("origin")
    settings = get_settings()
    if origin and (origin in settings.cors_origins or "*" in settings.cors_origins):
        response.headers["Access-Control-Allow-Origin"] = "*" if "*" in settings.cors_origins else origin
        response.headers["Access-Control-Expose-Headers"] = "X-Request-ID"
        response.headers.append("Vary", "Origin")
    request_id = getattr(request.state, "request_id", None)
    response.headers["X-Request-ID"] = str(request_id if isinstance(request_id, UUID) else uuid4())
    return response


app.add_exception_handler(Exception, internal_server_error)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    expose_headers=["X-Request-ID"],
    allow_headers=(
        ["Content-Type", "Authorization"]
        if settings.desktop_mode or settings.app_env != "development"
        else ["Content-Type", "Authorization", "X-Tenant-ID", "X-User-ID", "X-Role"]
    ),
)
# Middleware is LIFO: this must be registered after CORS so OPTIONS responses
# that CORS short-circuits still receive the security headers.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIdMiddleware)
app.include_router(router)
app.include_router(domain_router)
app.include_router(auth_router)
app.include_router(agent_router)
app.include_router(settings_router)


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
    settings = get_settings()
    if settings.desktop_mode or settings.app_env != "development":
        raise HTTPException(status_code=404, detail="demo seed is available only in local development")
    if principal.role != "admin":
        raise HTTPException(status_code=403, detail="admin permission required")
    return seed_demo(db)
