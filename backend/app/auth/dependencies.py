from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Header, HTTPException, status

from app.auth.tokens import decode_token


ROLES = {"admin", "bid_manager", "reviewer", "subject_matter_expert", "legal", "finance", "viewer"}
WRITE_ROLES = {"admin", "bid_manager"}
REVIEW_ROLES = {"admin", "bid_manager", "reviewer", "legal"}


@dataclass(frozen=True)
class Principal:
    tenant_id: UUID
    user_id: UUID
    role: str


def get_principal(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_tenant_id: UUID | None = Header(default=None, alias="X-Tenant-ID"),
    x_user_id: UUID | None = Header(default=None, alias="X-User-ID"),
    x_role: str | None = Header(default=None, alias="X-Role"),
) -> Principal:
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=401, detail="invalid authorization header")
        payload = decode_token(token)
        return Principal(
            tenant_id=UUID(payload["tenant_id"]),
            user_id=UUID(payload["user_id"]),
            role=payload["role"],
        )
    if x_tenant_id is None or x_user_id is None or x_role is None:
        raise HTTPException(status_code=401, detail="authentication required")
    if x_role not in ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="unknown role")
    return Principal(tenant_id=x_tenant_id, user_id=x_user_id, role=x_role)


def require_write(principal: Principal) -> None:
    if principal.role not in WRITE_ROLES:
        raise HTTPException(status_code=403, detail="write permission required")


def require_review(principal: Principal) -> None:
    if principal.role not in REVIEW_ROLES:
        raise HTTPException(status_code=403, detail="review permission required")
