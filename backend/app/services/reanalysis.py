"""Atomic document reanalysis: parse and extract before replacing current requirements."""

from __future__ import annotations

import hashlib
from decimal import Decimal
from typing import Callable
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.agents.provider import get_requirement_provider
from app.audit.service import append_event, stable_hash
from app.auth.dependencies import Principal
from app.core.config import get_settings
from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models.entities import AsyncJob, Document, DocumentPage, ModelRun, Requirement
from app.parsers.deterministic import DeterministicTextParser, ParsedPage
from app.parsers.ocr import apply_ocr, get_ocr_adapter
from app.schemas.requirements import RequirementBatch
from app.services.extraction import (
    PROMPT_VERSION,
    REQUIREMENT_SYSTEM_PROMPT,
    _create_candidate,
    build_requirement_page_input,
    validate_requirement_batch_source,
)
from app.storage.adapter import get_storage_adapter


class ReanalysisConflict(ValueError):
    """The document already has an active analysis job."""


_ACTIVE_ANALYSIS_JOB_TYPES = ("document_parse", "requirement_extraction", "document_reanalysis")
_ACTIVE_JOB_STATUSES = ("queued", "running", "retrying")


def _assert_publish_rights(
    db,
    job: AsyncJob,
    worker_id: str | None,
    lease_valid: Callable[[], bool] | None,
) -> None:
    db.refresh(job)
    if job.cancel_requested:
        raise ReanalysisConflict("document reanalysis was cancelled")
    if worker_id is not None and (job.status != "running" or job.lease_owner != worker_id):
        raise ReanalysisConflict("document reanalysis lease was lost")
    if lease_valid is not None and not lease_valid():
        raise ReanalysisConflict("document reanalysis lease was lost")


def create_reanalysis_job(db, principal: Principal, document: Document) -> AsyncJob:
    active = db.scalar(
        select(AsyncJob.id).where(
            AsyncJob.tenant_id == principal.tenant_id,
            AsyncJob.entity_id == document.id,
            AsyncJob.job_type.in_(_ACTIVE_ANALYSIS_JOB_TYPES),
            AsyncJob.status.in_(_ACTIVE_JOB_STATUSES),
        )
    )
    if active is not None:
        raise ReanalysisConflict("document already has an active analysis job")
    job = AsyncJob(
        tenant_id=principal.tenant_id,
        created_by=principal.user_id,
        job_type="document_reanalysis",
        entity_id=document.id,
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ReanalysisConflict("document already has an active analysis job") from exc
    db.refresh(job)
    return job


async def run_document_reanalysis_job(
    job_id: UUID,
    principal: Principal,
    *,
    worker_id: str | None = None,
    lease_valid: Callable[[], bool] | None = None,
) -> None:
    """Replace pages/current requirements only after parsing and every extraction call succeeds."""
    db = SessionLocal()
    try:
        job = db.get(AsyncJob, job_id)
        if job is None or job.tenant_id != principal.tenant_id:
            return
        if job.job_type != "document_reanalysis":
            raise ValueError("unexpected job type")
        document = db.get(Document, job.entity_id)
        if document is None or document.tenant_id != principal.tenant_id:
            raise ValueError("document not found")
        base_revision = document.parse_revision

        job.status, job.progress, job.current_step = "running", 5, "loading_document"
        db.commit()
        _assert_publish_rights(db, job, worker_id, lease_valid)

        data = get_storage_adapter().read(document.storage_key)
        settings = get_settings()
        pages = apply_ocr(
            DeterministicTextParser().parse(data, document.mime_type),
            data,
            document.mime_type,
            get_ocr_adapter(settings.ocr_mode, settings.ocr_languages),
        )
        provider = get_requirement_provider()
        batches: list[tuple[ParsedPage, RequirementBatch]] = []
        for index, page in enumerate(pages, start=1):
            batch = await provider.structured_generate(
                system_prompt=REQUIREMENT_SYSTEM_PROMPT,
                user_input=build_requirement_page_input(page.raw_text, page.page_number),
                output_schema=RequirementBatch,
                metadata={"source_page": page.page_number, "prompt_version": PROMPT_VERSION},
            )
            validate_requirement_batch_source(
                batch,
                source_page=page.page_number,
                page_text=page.raw_text,
            )
            _assert_publish_rights(db, job, worker_id, lease_valid)
            batches.append((page, batch))
            job.progress = 10 + int(55 * index / max(1, len(pages)))
            job.current_step = f"extracting_page_{page.page_number}"
            db.commit()

        extracted_requirement_count = sum(len(batch.results) for _, batch in batches)
        # Progress commits may have opened a read transaction through expired ORM state.
        # Publish from a fresh transaction and reject a concurrent successful revision.
        db.rollback()
        with db.begin():
            job = db.get(AsyncJob, job_id)
            if job is None:
                raise ValueError("job not found")
            _assert_publish_rights(db, job, worker_id, lease_valid)
            document = db.get(Document, job.entity_id)
            if document is None:
                raise ValueError("document not found")
            if document.parse_revision != base_revision:
                raise ReanalysisConflict("document revision changed during reanalysis")
            revision = base_revision + 1
            existing_page_count = int(
                db.scalar(
                    select(func.count())
                    .select_from(DocumentPage)
                    .where(DocumentPage.document_id == document.id)
                )
                or 0
            )
            old_requirements = list(
                db.scalars(
                    select(Requirement).where(
                        Requirement.source_document_id == document.id,
                        Requirement.tenant_id == principal.tenant_id,
                        Requirement.is_current.is_(True),
                    )
                )
            )
            now = utcnow()
            if extracted_requirement_count == 0 and (old_requirements or existing_page_count):
                raise ValueError("reanalysis produced no requirements; current requirements were preserved")
            for requirement in old_requirements:
                requirement.is_current = False
                requirement.superseded_at = now
                requirement.version += 1

            requirement_count = 0
            for page, batch in batches:
                db.add(
                    DocumentPage(
                        tenant_id=principal.tenant_id,
                        created_by=principal.user_id,
                        document_id=document.id,
                        page_number=page.page_number,
                        parse_revision=revision,
                        raw_text=page.raw_text,
                        markdown=page.raw_text,
                        layout_json=page.layout_json,
                        ocr_used=page.ocr_used,
                    )
                )
                for item in batch.results:
                    requirement = Requirement(
                        tenant_id=principal.tenant_id,
                        created_by=principal.user_id,
                        project_id=document.project_id,
                        requirement_code=item.requirement_code,
                        category=item.category,
                        title=item.title,
                        normalized_requirement=item.normalized_requirement,
                        original_text=item.original_text,
                        original_hash=hashlib.sha256(item.original_text.encode()).hexdigest(),
                        mandatory=item.mandatory,
                        disqualification_if_failed=item.disqualification_if_failed,
                        risk_level="fatal"
                        if item.disqualification_if_failed
                        else ("high" if item.mandatory else "medium"),
                        source_document_id=document.id,
                        source_page=item.source_page,
                        source_bbox=item.source_bbox.model_dump() if item.source_bbox else None,
                        clause_number=item.clause_number,
                        extraction_confidence=Decimal(str(item.confidence)),
                        extraction_revision=revision,
                        is_current=True,
                        review_status="manual_review" if item.confidence < 0.70 else "unreviewed",
                        review_reason=item.manual_review_reason,
                    )
                    db.add(requirement)
                    db.flush()
                    _create_candidate(db, principal, requirement)
                    requirement_count += 1
                db.add(
                    ModelRun(
                        id=uuid4(),
                        tenant_id=principal.tenant_id,
                        project_id=document.project_id,
                        task_type="requirement_extraction",
                        provider=provider.name,
                        model=provider.model,
                        prompt_version=PROMPT_VERSION,
                        input_hash=stable_hash(page.raw_text),
                        output_hash=stable_hash(batch.model_dump(mode="json")),
                        status="completed",
                        output_schema=RequirementBatch.__name__,
                        source_document_id=document.id,
                        source_page=page.page_number,
                        metadata_json={"reanalysis": True, "revision": revision},
                    )
                )
            document.parse_revision = revision
            document.page_count = len(pages)
            document.parse_status = "completed"
            job.status, job.progress, job.current_step, job.retryable = "completed", 100, "completed", False
            job.error = None
            if worker_id is not None:
                job.lease_owner = None
                job.lease_expires_at = None
                job.heartbeat_at = utcnow()
            append_event(
                db,
                principal,
                action="document.reanalyzed",
                entity_type="document",
                entity_id=document.id,
                project_id=document.project_id,
                after={
                    "parse_revision": revision,
                    "page_count": len(pages),
                    "requirement_count": requirement_count,
                    "superseded_requirement_count": len(old_requirements),
                },
                model_name=provider.model,
                prompt_version=PROMPT_VERSION,
            )
    except Exception as exc:
        db.rollback()
        job = db.get(AsyncJob, job_id)
        if job is not None:
            # A claimed worker leaves terminal/retry selection to the queue's
            # compare-and-set finalizer. Never overwrite a successor's lease.
            if worker_id is None:
                job.status, job.current_step, job.error, job.retryable = (
                    "failed",
                    "failed",
                    str(exc)[:1000],
                    False,
                )
                db.commit()
            elif job.status == "running" and job.lease_owner == worker_id:
                job.error = str(exc)[:1000]
                db.commit()
    finally:
        db.close()
