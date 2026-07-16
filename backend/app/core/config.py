from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


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


def get_settings() -> Settings:
    backend_root = Path(__file__).resolve().parents[2]
    cors_origins = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    )
    return Settings(
        database_url=os.getenv("DATABASE_URL", f"sqlite:///{backend_root / 'bidevidence.db'}"),
        upload_dir=Path(os.getenv("UPLOAD_DIR", backend_root / "data" / "uploads")),
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
    )
