from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.auth.dependencies import Principal
from app.audit.context import audit_request_id
from app.models.entities import AuditEvent


def stable_hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()


def json_safe(value: Any) -> Any:
    """Normalize boundary values for portable SQLite/PostgreSQL JSON columns."""
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def append_event(
    db: Session,
    principal: Principal,
    *,
    action: str,
    entity_type: str,
    entity_id: UUID,
    project_id: UUID | None,
    before: dict | None = None,
    after: dict | None = None,
    model_name: str | None = None,
    prompt_version: str | None = None,
    metadata: dict | None = None,
) -> AuditEvent:
    safe_before = json_safe(before) if before is not None else None
    safe_after = json_safe(after) if after is not None else None
    event = AuditEvent(
        id=uuid4(),
        request_id=audit_request_id(),
        tenant_id=principal.tenant_id,
        project_id=project_id,
        actor_type="human" if model_name is None else "agent",
        actor_id=principal.user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_json=safe_before,
        after_json=safe_after,
        input_hash=stable_hash(safe_before) if safe_before is not None else None,
        output_hash=stable_hash(safe_after) if safe_after is not None else None,
        model_name=model_name,
        prompt_version=prompt_version,
        metadata_json=json_safe(metadata or {}),
    )
    db.add(event)
    return event
