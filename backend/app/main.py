from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import models as _models  # noqa: F401
from app.api.routes import router
from app.api.domain_routes import router as domain_router
from app.api.auth_routes import router as auth_router
from app.auth.dependencies import Principal, get_principal
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine, get_db
from app.services.seed import seed_demo


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="BidEvidence API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Tenant-ID", "X-User-ID", "X-Role"],
)
app.include_router(router)
app.include_router(domain_router)
app.include_router(auth_router)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "bidevidence-api",
        "version": "0.1.0",
        "llm_provider": "mock",
    }


@app.post("/api/dev/seed")
def seed(db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> dict:
    if principal.role != "admin":
        raise HTTPException(status_code=403, detail="admin permission required")
    return seed_demo(db)
