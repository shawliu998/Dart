from __future__ import annotations

from pathlib import Path
from typing import Protocol
from uuid import UUID, uuid4

from app.core.config import get_settings
from app.storage.local import resolve_storage, store_bytes


class StorageAdapter(Protocol):
    def put(self, tenant_id: UUID, project_id: UUID, filename: str, data: bytes) -> str: ...
    def read(self, storage_key: str) -> bytes: ...
    def signed_url(self, storage_key: str, expires_seconds: int = 300) -> str | None: ...


class LocalStorageAdapter:
    def __init__(self, root: Path):
        self.root = root

    def put(self, tenant_id: UUID, project_id: UUID, filename: str, data: bytes) -> str:
        return store_bytes(self.root, tenant_id, project_id, filename, data)

    def read(self, storage_key: str) -> bytes:
        return resolve_storage(self.root, storage_key).read_bytes()

    def signed_url(self, storage_key: str, expires_seconds: int = 300) -> str | None:
        return None


class S3CompatibleStorageAdapter:
    """S3/MinIO adapter using the SDK credential chain; secrets are never logged."""

    def __init__(
        self,
        endpoint_url: str,
        bucket: str,
        region: str,
        access_key: str | None = None,
        secret_key: str | None = None,
    ):
        import boto3  # type: ignore[import-untyped]  # boto3 runtime package has no py.typed

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )

    def put(self, tenant_id: UUID, project_id: UUID, filename: str, data: bytes) -> str:
        key = f"{tenant_id}/{project_id}/{uuid4()}_{filename}"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)
        return f"s3://{self.bucket}/{key}"

    def read(self, storage_key: str) -> bytes:
        bucket, key = split_s3_key(storage_key)
        return self.client.get_object(Bucket=bucket, Key=key)["Body"].read()

    def signed_url(self, storage_key: str, expires_seconds: int = 300) -> str | None:
        bucket, key = split_s3_key(storage_key)
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_seconds,
        )


def split_s3_key(storage_key: str) -> tuple[str, str]:
    if not storage_key.startswith("s3://"):
        raise ValueError("invalid S3 storage key")
    bucket, _, key = storage_key[5:].partition("/")
    if not bucket or not key or ".." in key.split("/"):
        raise ValueError("invalid S3 storage key")
    return bucket, key


def get_storage_adapter() -> StorageAdapter:
    settings = get_settings()
    if settings.s3_endpoint_url and settings.s3_bucket:
        return S3CompatibleStorageAdapter(
            settings.s3_endpoint_url,
            settings.s3_bucket,
            settings.s3_region,
            settings.s3_access_key,
            settings.s3_secret_key,
        )
    return LocalStorageAdapter(settings.upload_dir)
