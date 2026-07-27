from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.schemas.common import ORMModel


class AuditEventRead(ORMModel):
    id: UUID
    request_id: UUID
    project_id: UUID | None = None
    action: str
    entity_type: str
    entity_id: UUID
    timestamp: datetime
    before: dict | None = None
    after: dict | None = None
    input_hash: str | None = None
    output_hash: str | None = None
    model_name: str | None = None
    prompt_version: str | None = None
