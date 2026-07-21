from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.api.routes import UPLOAD_READ_CHUNK_BYTES, read_upload_with_limit
from app.core.config import get_settings


class ChunkedUpload:
    def __init__(self, data: bytes):
        self.data = data
        self.position = 0
        self.request_sizes: list[int] = []

    async def read(self, size: int = -1) -> bytes:
        self.request_sizes.append(size)
        if self.position >= len(self.data):
            return b""
        end = len(self.data) if size < 0 else min(self.position + size, len(self.data))
        chunk = self.data[self.position : end]
        self.position = end
        return chunk


def test_upload_reader_reads_in_bounded_chunks() -> None:
    upload = ChunkedUpload(b"x" * (UPLOAD_READ_CHUNK_BYTES + 3))

    data = asyncio.run(read_upload_with_limit(upload, len(upload.data)))

    assert data == upload.data
    assert upload.request_sizes == [UPLOAD_READ_CHUNK_BYTES, 4, 1]
    assert all(size != -1 and size <= UPLOAD_READ_CHUNK_BYTES for size in upload.request_sizes)


def test_upload_reader_rejects_after_first_byte_over_limit() -> None:
    upload = ChunkedUpload(b"x" * 20)

    with pytest.raises(HTTPException, match="file is too large") as error:
        asyncio.run(read_upload_with_limit(upload, 5))

    assert error.value.status_code == 413
    assert upload.request_sizes == [6]
    assert upload.position == 6


def test_upload_reader_rejects_negative_limit_without_reading() -> None:
    upload = ChunkedUpload(b"x" * 20)

    with pytest.raises(ValueError, match="must not be negative"):
        asyncio.run(read_upload_with_limit(upload, -1))

    assert upload.request_sizes == []


def test_settings_reject_non_positive_upload_limit(monkeypatch) -> None:
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "0")

    with pytest.raises(ValueError, match="MAX_UPLOAD_BYTES must be positive"):
        get_settings()


def test_upload_api_rejects_over_limit_before_persisting(client, demo, monkeypatch) -> None:
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "8")
    project_id = demo["project_id"]
    headers = demo["auth_headers"]
    before = client.get(f"/api/projects/{project_id}/documents", headers=headers).json()

    def ingest_must_not_run(*_args, **_kwargs):
        raise AssertionError("oversized upload must not reach document ingestion")

    monkeypatch.setattr("app.api.routes.document_service.ingest_document", ingest_must_not_run)

    response = client.post(
        f"/api/projects/{project_id}/documents",
        headers=headers,
        data={"document_type": "tender_main"},
        files={"file": ("oversized.pdf", b"%PDF-oversized", "application/pdf")},
    )

    assert response.status_code == 413
    assert client.get(f"/api/projects/{project_id}/documents", headers=headers).json() == before
