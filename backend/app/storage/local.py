from __future__ import annotations

import hashlib
import re
import unicodedata
from pathlib import Path
from uuid import UUID, uuid4


ALLOWED_EXTENSIONS = {
    ".pdf": {"application/pdf", "application/x-bidevidence-pseudo-pdf"},
    ".txt": {"text/plain"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
}


def sanitize_filename(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip()
    if not normalized or normalized != Path(normalized).name or ".." in normalized:
        raise ValueError("unsafe filename")
    normalized = re.sub(r"[\x00-\x1f\x7f]", "", normalized)
    normalized = re.sub(r"[^\w.\-()\u4e00-\u9fff]", "_", normalized, flags=re.UNICODE)
    if not normalized or normalized.startswith(".") or len(normalized.encode("utf-8")) > 240:
        raise ValueError("unsafe filename")
    return normalized


def validate_mime(filename: str, declared: str, data: bytes) -> None:
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS or declared not in ALLOWED_EXTENSIONS[extension]:
        raise ValueError("file extension and MIME type are not allowed")
    signatures = {
        ".pdf": data.startswith(b"%PDF") or declared == "application/x-bidevidence-pseudo-pdf",
        ".docx": data.startswith(b"PK\x03\x04"),
        ".xlsx": data.startswith(b"PK\x03\x04"),
        ".png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": data.startswith(b"\xff\xd8\xff"),
        ".jpeg": data.startswith(b"\xff\xd8\xff"),
        ".txt": b"\x00" not in data[:4096],
    }
    if not signatures[extension]:
        raise ValueError("file signature does not match declared type")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def store_bytes(root: Path, tenant_id: UUID, project_id: UUID, filename: str, data: bytes) -> str:
    root_resolved = root.resolve()
    directory = root_resolved / str(tenant_id) / str(project_id)
    directory.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid4()}_{filename}"
    destination = (directory / storage_name).resolve()
    if directory.resolve() not in destination.parents:
        raise ValueError("storage path escaped tenant directory")
    destination.write_bytes(data)
    return str(destination.relative_to(root_resolved))


def resolve_storage(root: Path, storage_key: str) -> Path:
    candidate = (root / storage_key).resolve()
    if root.resolve() not in candidate.parents:
        raise ValueError("invalid storage key")
    return candidate
