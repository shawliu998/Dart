"""Bootstrap the single local principal used by the packaged desktop application."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import Organization, User


def bootstrap_local_workspace(db: Session, settings: Settings) -> tuple[UUID, UUID]:
    """Create the desktop workspace identity once without accepting renderer identity headers."""
    if not settings.desktop_mode:
        raise RuntimeError("local workspace bootstrap is only available in desktop mode")
    if settings.local_tenant_id is None or settings.local_user_id is None:
        raise RuntimeError("desktop workspace identifiers were not supplied by the host")
    tenant_id, user_id = settings.local_tenant_id, settings.local_user_id
    if db.get(Organization, tenant_id) is None:
        db.add(
            Organization(
                id=tenant_id,
                name="本地工作区",
                legal_name="本地工作区",
            )
        )
    user = db.get(User, user_id)
    if user is None:
        db.add(
            User(
                id=user_id,
                organization_id=tenant_id,
                name="本地用户",
                email=f"desktop-{user_id}@local.invalid",
                role="admin",
                status="active",
                password_hash=None,
            )
        )
    elif user.organization_id != tenant_id:
        raise RuntimeError("desktop user identity belongs to a different local workspace")
    db.commit()
    return tenant_id, user_id
