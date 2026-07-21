from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from fastapi import HTTPException

from app.core.config import get_settings

PBKDF2_ITERATIONS = 210_000
DEVELOPMENT_AUTH_SECRET = "development-only-change-me"


def _require_safe_server_secret() -> None:
    """Fail closed outside local development when the public demo secret remains."""
    settings = get_settings()
    if settings.app_env != "development" and settings.auth_secret == DEVELOPMENT_AUTH_SECRET:
        raise HTTPException(status_code=503, detail="non-development auth secret is not configured")


def hash_password(password: str, *, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        algorithm, iterations, salt, expected = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), int(iterations)
        ).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_token(payload: dict[str, Any], ttl_seconds: int = 1800) -> str:
    settings = get_settings()
    _require_safe_server_secret()
    body = {**payload, "exp": int(time.time()) + ttl_seconds}
    encoded = _b64(json.dumps(body, sort_keys=True, separators=(",", ":")).encode())
    signature = _b64(
        hmac.new(settings.auth_secret.encode(), encoded.encode(), hashlib.sha256).digest()
    )
    return f"{encoded}.{signature}"


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    _require_safe_server_secret()
    try:
        encoded, signature = token.split(".", 1)
        expected = _b64(
            hmac.new(settings.auth_secret.encode(), encoded.encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        payload = json.loads(_unb64(encoded))
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired")
        if payload["role"] not in {
            "admin",
            "bid_manager",
            "reviewer",
            "subject_matter_expert",
            "legal",
            "finance",
            "viewer",
        }:
            raise ValueError("role")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail="invalid or expired token") from exc
