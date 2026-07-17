from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID


@dataclass(frozen=True)
class Settings:
    database_url: str
    upload_dir: Path
    max_upload_bytes: int
    cors_origins: tuple[str, ...]
    app_env: str
    auth_secret: str
    s3_endpoint_url: str | None
    s3_bucket: str | None
    s3_region: str
    s3_access_key: str | None
    s3_secret_key: str | None
    desktop_mode: bool
    desktop_bearer_token: str | None
    local_tenant_id: UUID | None
    local_user_id: UUID | None
    app_data_dir: Path | None
    llm_provider: str


def get_settings() -> Settings:
    backend_root = Path(__file__).resolve().parents[2]
    desktop_mode = os.getenv("BIDEVIDENCE_DESKTOP_MODE", "").lower() in {"1", "true", "yes"}
    app_data_value = os.getenv("BIDEVIDENCE_APP_DATA_DIR")
    app_data_dir = Path(app_data_value).expanduser() if app_data_value else None
    if desktop_mode and app_data_dir is None:
        raise RuntimeError("BIDEVIDENCE_APP_DATA_DIR is required in desktop mode")
    if app_data_dir is not None:
        app_data_dir.mkdir(parents=True, exist_ok=True)
    database_default = (
        f"sqlite:///{app_data_dir / 'workspace.sqlite3'}"
        if desktop_mode and app_data_dir is not None
        else f"sqlite:///{backend_root / 'bidevidence.db'}"
    )
    upload_default = app_data_dir / "documents" if app_data_dir is not None else backend_root / "data" / "uploads"
    token = os.getenv("BIDEVIDENCE_DESKTOP_TOKEN")
    if desktop_mode and (token is None or len(token) < 32):
        raise RuntimeError("BIDEVIDENCE_DESKTOP_TOKEN must be a per-launch random secret")
    cors_origins = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    )
    return Settings(
        # A packaged desktop instance must never inherit a developer DATABASE_URL or
        # UPLOAD_DIR and accidentally write user documents outside its user-data root.
        database_url=database_default if desktop_mode else os.getenv("DATABASE_URL", database_default),
        upload_dir=upload_default if desktop_mode else Path(os.getenv("UPLOAD_DIR", upload_default)),
        max_upload_bytes=int(os.getenv("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024))),
        cors_origins=cors_origins,
        app_env=os.getenv("APP_ENV", "development"),
        auth_secret=os.getenv("AUTH_SECRET")
        or os.getenv("JWT_SECRET")
        or "development-only-change-me",
        s3_endpoint_url=os.getenv("S3_ENDPOINT_URL") or os.getenv("MINIO_ENDPOINT"),
        s3_bucket=os.getenv("S3_BUCKET") or os.getenv("MINIO_BUCKET"),
        s3_region=os.getenv("S3_REGION", "us-east-1"),
        s3_access_key=os.getenv("S3_ACCESS_KEY"),
        s3_secret_key=os.getenv("S3_SECRET_KEY"),
        desktop_mode=desktop_mode,
        desktop_bearer_token=token,
        local_tenant_id=UUID(os.getenv("BIDEVIDENCE_LOCAL_TENANT_ID"))
        if os.getenv("BIDEVIDENCE_LOCAL_TENANT_ID")
        else None,
        local_user_id=UUID(os.getenv("BIDEVIDENCE_LOCAL_USER_ID"))
        if os.getenv("BIDEVIDENCE_LOCAL_USER_ID")
        else None,
        app_data_dir=app_data_dir,
        # This is a provider identifier only. Credentials stay external to settings
        # and unsupported providers are rejected by the provider registry.
        llm_provider=os.getenv("BIDEVIDENCE_LLM_PROVIDER", "mock").strip().lower(),
    )
