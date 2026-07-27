"""Request-scoped correlation identifiers for append-only audit events."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Iterator
from uuid import UUID, uuid4

_http_request_id: ContextVar[UUID | None] = ContextVar("http_request_id", default=None)


def bind_http_request_id(request_id: UUID) -> Token[UUID | None]:
    return _http_request_id.set(request_id)


def reset_http_request_id(token: Token[UUID | None]) -> None:
    _http_request_id.reset(token)


def audit_request_id() -> UUID:
    """Return the HTTP correlation ID, or a fresh ID for detached work."""
    return _http_request_id.get() or uuid4()


@contextmanager
def detached_audit_context() -> Iterator[None]:
    """Prevent background work from inheriting an enqueue request's context."""
    token = _http_request_id.set(None)
    try:
        yield
    finally:
        _http_request_id.reset(token)
