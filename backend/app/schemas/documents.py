from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.schemas.common import ORMModel


class DocumentRead(ORMModel):
    id: UUID
    project_id: UUID
    document_type: str
    filename: str
    mime_type: str
    size: int
    sha256: str
    version_number: int
    parse_status: str
    page_count: int
    created_at: datetime


class PageRead(ORMModel):
    document_id: UUID
    page_number: int
    raw_text: str
    markdown: str
    layout_json: dict
    ocr_used: bool
