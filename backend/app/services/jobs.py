from __future__ import annotations

import asyncio
from datetime import timedelta
from typing import cast
from uuid import UUID, uuid4

from sqlalchemy import and_, or_, select, update
from sqlalchemy.engine import CursorResult

from app.auth.dependencies import Principal
from app.db.session import SessionLocal
from app.db.base import utcnow
from app.models.entities import AsyncJob
from app.services.documents import run_parse_job
from app.services.evidence import suggest_matches
from app.services.extraction import run_extraction_job
from app.services.packaging import validate_package
from app.services.review_workflows import run_compliance, run_consistency
from app.services.agent_runtime import process_agent_run


LEASE_SECONDS = 60
RETRY_DELAYS_SECONDS = (5, 30, 120)


def _claimable(now):
    return and_(
        or_(
            AsyncJob.status == "queued",
            and_(
                AsyncJob.status == "running",
                AsyncJob.lease_expires_at.is_not(None),
                AsyncJob.lease_expires_at < now,
            ),
        ),
        AsyncJob.cancel_requested.is_(False),
        AsyncJob.attempt_count < AsyncJob.max_attempts,
        or_(AsyncJob.next_retry_at.is_(None), AsyncJob.next_retry_at <= now),
    )


def claim_next_job(worker_id: str) -> UUID | None:
    """SQLite-safe compare-and-set claim; expired leases are recoverable."""
    now = utcnow()
    with SessionLocal() as db:
        job_id = db.scalar(
            select(AsyncJob.id)
            .where(_claimable(now))
            .order_by(AsyncJob.created_at)
            .limit(1)
        )
        if job_id is None:
            return None
        claimed = cast(
            CursorResult,
            db.execute(
                update(AsyncJob)
                .where(AsyncJob.id == job_id, _claimable(now))
                .values(
                    status="running",
                    lease_owner=worker_id,
                    lease_expires_at=now + timedelta(seconds=LEASE_SECONDS),
                    heartbeat_at=now,
                    attempt_count=AsyncJob.attempt_count + 1,
                    next_retry_at=None,
                )
            ),
        )
        db.commit()
        return job_id if claimed.rowcount == 1 else None


def heartbeat_job(job_id: UUID, worker_id: str) -> bool:
    """Extend a live worker lease without letting another worker take ownership."""
    now = utcnow()
    with SessionLocal() as db:
        updated = cast(
            CursorResult,
            db.execute(
                update(AsyncJob)
                .where(
                    AsyncJob.id == job_id,
                    AsyncJob.status == "running",
                    AsyncJob.lease_owner == worker_id,
                    AsyncJob.cancel_requested.is_(False),
                )
                .values(
                    heartbeat_at=now,
                    lease_expires_at=now + timedelta(seconds=LEASE_SECONDS),
                )
            ),
        )
        db.commit()
        return updated.rowcount == 1


def _finish_claim(job_id: UUID, worker_id: str | None, succeeded: bool, error: str | None = None) -> bool:
    """Finalize only the job lease owned by this worker; cancellation wins races."""
    with SessionLocal() as db:
        job = db.get(AsyncJob, job_id)
        if job is None or (worker_id and job.lease_owner != worker_id):
            return False
        job.lease_owner = None
        job.lease_expires_at = None
        job.heartbeat_at = utcnow()
        if job.cancel_requested:
            job.status, job.current_step, job.retryable = "cancelled", "cancelled", False
        elif succeeded:
            job.status, job.progress, job.current_step, job.retryable = "completed", 100, "completed", False
        elif job.attempt_count < job.max_attempts:
            delay = RETRY_DELAYS_SECONDS[min(job.attempt_count - 1, len(RETRY_DELAYS_SECONDS) - 1)]
            job.status, job.current_step, job.retryable = "queued", "retry_scheduled", True
            job.next_retry_at = utcnow() + timedelta(seconds=delay)
            job.error = (error or job.error or "job failed")[:1000]
        else:
            job.status, job.current_step, job.retryable = "failed", "failed", False
            job.error = (error or job.error or "job failed")[:1000]
        db.commit()
        return True


def dispatch_job(job_id: UUID, worker_id: str | None = None) -> bool:
    with SessionLocal() as db:
        job = db.get(AsyncJob, job_id)
        if job is None or job.status not in {"queued", "running"}:
            return False
        if worker_id and job.lease_owner != worker_id:
            return False
        principal = Principal(tenant_id=job.tenant_id, user_id=job.created_by, role="admin")
        job_type = job.job_type
        entity_id = job.entity_id
    if worker_id and not heartbeat_job(job_id, worker_id):
        return False
    try:
        if job_type == "document_parse":
            run_parse_job(job_id, principal)
            with SessionLocal() as db:
                succeeded = (job := db.get(AsyncJob, job_id)) is not None and job.status == "completed"
                error = job.error if job else "job not found"
        elif job_type == "requirement_extraction":
            asyncio.run(run_extraction_job(job_id, principal))
            with SessionLocal() as db:
                succeeded = (job := db.get(AsyncJob, job_id)) is not None and job.status == "completed"
                error = job.error if job else "job not found"
        elif job_type == "agent_run":
            succeeded = process_agent_run(entity_id)
            error = None if succeeded else "agent run did not complete"
        else:
            with SessionLocal() as db:
                job = db.get(AsyncJob, job_id)
                if job is None:
                    return False
                job.status = "running"
                job.progress = 10
                job.current_step = job_type
                db.commit()
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
                succeeded, error = True, None
        _finish_claim(job_id, worker_id, succeeded, error)
        return succeeded
    except Exception as exc:
        _finish_claim(job_id, worker_id, False, str(exc))
        return False


def process_next_job() -> bool:
    worker_id = f"worker-{uuid4()}"
    job_id = claim_next_job(worker_id)
    return dispatch_job(job_id, worker_id) if job_id else False
