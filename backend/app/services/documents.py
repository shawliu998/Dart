from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.audit.service import append_event
from app.auth.dependencies import Principal
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import AsyncJob, Document, DocumentPage
from app.parsers.deterministic import DeterministicTextParser
from app.storage.adapter import get_storage_adapter
from app.storage.local import (
    sanitize_filename,
    sha256_bytes,
    validate_mime,
)

DOCUMENT_TYPES = {
    "tender_main",
    "tender_attachment",
    "amendment",
    "clarification",
    "enterprise_evidence",
    "bid_response",
    "pricing",
    "authorization",
    "other",
}


def get_document(db: Session, principal: Principal, document_id: UUID) -> Document:
    document = db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.tenant_id == principal.tenant_id,
            Document.deleted_at.is_(None),
        )
    )
    if document is None:
        raise HTTPException(status_code=404, detail="document not found")
    return document


def ingest_document(
    db: Session,
    principal: Principal,
    *,
    project_id: UUID,
    filename: str,
    declared_mime: str,
    document_type: str,
    data: bytes,
) -> Document:
    settings = get_settings()
    if document_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=422, detail="unsupported document_type")
    if not data or len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413 if data else 422, detail="file is empty or too large")
    try:
        clean_name = sanitize_filename(filename)
        validate_mime(clean_name, declared_mime, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    digest = sha256_bytes(data)
    existing = db.scalar(
        select(Document).where(
            Document.project_id == project_id,
            Document.tenant_id == principal.tenant_id,
            Document.sha256 == digest,
            Document.deleted_at.is_(None),
        )
    )
    if existing:
        append_event(
            db,
            principal,
            action="document.uploaded",
            entity_type="document",
            entity_id=existing.id,
            project_id=project_id,
            after={"filename": existing.filename, "sha256": digest, "deduplicated": True},
        )
        db.commit()
        return existing
    storage_key = get_storage_adapter().put(principal.tenant_id, project_id, clean_name, data)
    document = Document(
        tenant_id=principal.tenant_id,
        created_by=principal.user_id,
        uploaded_by=principal.user_id,
        project_id=project_id,
        document_type=document_type,
        filename=clean_name,
        storage_key=storage_key,
        mime_type=declared_mime,
        size=len(data),
        sha256=digest,
    )
    db.add(document)
    db.flush()
    append_event(
        db,
        principal,
        action="document.uploaded",
        entity_type="document",
        entity_id=document.id,
        project_id=project_id,
        after={
            "filename": clean_name,
            "mime_type": declared_mime,
            "size": len(data),
            "sha256": digest,
        },
    )
    db.commit()
    db.refresh(document)
    return document


def create_job(db: Session, principal: Principal, *, job_type: str, entity_id: UUID) -> AsyncJob:
    job = AsyncJob(
        tenant_id=principal.tenant_id,
        created_by=principal.user_id,
        job_type=job_type,
        entity_id=entity_id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def run_parse_job(job_id: UUID, principal: Principal) -> None:
    db = SessionLocal()
    try:
        job = db.get(AsyncJob, job_id)
        if job is None or job.tenant_id != principal.tenant_id:
            return
        document = db.get(Document, job.entity_id)
        if document is None or document.tenant_id != principal.tenant_id:
            raise ValueError("document not found")
        job.status, job.progress, job.current_step = "running", 10, "loading_document"
        document.parse_status = "parsing"
        db.commit()
        data = get_storage_adapter().read(document.storage_key)
        pages = DeterministicTextParser().parse(data, document.mime_type)
        job.progress, job.current_step = 55, "saving_pages"
        db.execute(delete(DocumentPage).where(DocumentPage.document_id == document.id))
        for page in pages:
            db.add(
                DocumentPage(
                    tenant_id=principal.tenant_id,
                    created_by=principal.user_id,
                    document_id=document.id,
                    page_number=page.page_number,
                    raw_text=page.raw_text,
                    markdown=page.raw_text,
                    layout_json=page.layout_json,
                    ocr_used=page.ocr_used,
                )
            )
        document.page_count = len(pages)
        document.parse_status = "completed"
        job.status, job.progress, job.current_step, job.retryable = (
            "completed",
            100,
            "completed",
            False,
        )
        append_event(
            db,
            principal,
            action="document.parsed",
            entity_type="document",
            entity_id=document.id,
            project_id=document.project_id,
            after={"page_count": len(pages), "adapter": "deterministic-text-v1"},
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        job = db.get(AsyncJob, job_id)
        if job:
            job.status, job.current_step, job.error = "failed", "failed", str(exc)[:1000]
            db.commit()
    finally:
        db.close()
