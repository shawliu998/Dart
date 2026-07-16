from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import select

from app.auth.dependencies import Principal
from app.db.session import SessionLocal
from app.models.entities import AsyncJob
from app.services.documents import run_parse_job
from app.services.evidence import suggest_matches
from app.services.extraction import run_extraction_job
from app.services.packaging import validate_package
from app.services.review_workflows import run_compliance, run_consistency


def dispatch_job(job_id: UUID) -> bool:
    with SessionLocal() as db:
        job = db.get(AsyncJob, job_id)
        if job is None or job.status != "queued":
            return False
        principal = Principal(tenant_id=job.tenant_id, user_id=job.created_by, role="admin")
        job_type = job.job_type
        entity_id = job.entity_id
    if job_type == "document_parse":
        run_parse_job(job_id, principal)
        return True
    if job_type == "requirement_extraction":
        asyncio.run(run_extraction_job(job_id, principal))
        return True
    with SessionLocal() as db:
        job = db.get(AsyncJob, job_id)
        if job is None:
            return False
        job.status = "running"
        job.progress = 10
        job.current_step = job_type
        db.commit()
        try:
            if job_type == "evidence_match":
                suggest_matches(db, principal, entity_id)
            elif job_type == "compliance_run":
                run_compliance(db, principal, entity_id)
            elif job_type == "consistency_run":
                run_consistency(db, principal, entity_id)
            elif job_type == "package_validate":
                validate_package(db, principal, entity_id)
            else:
                raise ValueError(f"unsupported job type: {job_type}")
            job = db.get(AsyncJob, job_id)
            if job:
                job.status = "completed"
                job.progress = 100
                job.current_step = "completed"
                job.retryable = False
                db.commit()
            return True
        except Exception as exc:
            db.rollback()
            job = db.get(AsyncJob, job_id)
            if job:
                job.status = "failed"
                job.current_step = "failed"
                job.error = str(exc)[:1000]
                db.commit()
            return False


def process_next_job() -> bool:
    with SessionLocal() as db:
        job_id = db.scalar(
            select(AsyncJob.id)
            .where(AsyncJob.status == "queued")
            .order_by(AsyncJob.created_at)
            .limit(1)
        )
    return dispatch_job(job_id) if job_id else False
