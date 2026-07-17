from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import timedelta
from threading import Event, Thread
from typing import Callable, Iterator
from typing import cast
from uuid import UUID, uuid4

from sqlalchemy import and_, or_, select, update
from sqlalchemy.engine import CursorResult

from app.auth.dependencies import Principal
from app.db.session import SessionLocal
from app.db.base import utcnow
from app.models.entities import AgentRun, AsyncJob
from app.services.documents import run_parse_job
from app.services.evidence import suggest_matches
from app.services.extraction import run_extraction_job
from app.services.packaging import validate_package
from app.services.review_workflows import run_compliance, run_consistency
from app.services.agent_runtime import agent_run_heartbeat, process_agent_run


LEASE_SECONDS = 60
HEARTBEAT_INTERVAL_SECONDS = 20
RETRY_DELAYS_SECONDS = (5, 30, 120)


def _claimable(now):
    return and_(
        or_(
            AsyncJob.status == "queued",
            AsyncJob.status == "retrying",
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


@contextmanager
def maintain_job_lease(job_id: UUID, worker_id: str) -> Iterator[Callable[[], bool]]:
    """Renew a lease during long service calls, not only between workflow steps."""
    stopped = Event()
    lease_lost = Event()

    def ownership_ok() -> bool:
        return not lease_lost.is_set()

    def renew_once() -> bool:
        try:
            renewed = heartbeat_job(job_id, worker_id)
        except Exception:
            renewed = False
        if not renewed:
            lease_lost.set()
        return renewed

    def renew_periodically() -> None:
        while not stopped.wait(HEARTBEAT_INTERVAL_SECONDS):
            if not renew_once():
                return

    thread = Thread(
        target=renew_periodically,
        name=f"job-heartbeat-{job_id}",
        daemon=True,
    )
    thread.start()
    try:
        # The runtime may hold SQLite's write lock at a commit boundary.  It
        # must only read this in-memory ownership signal there; the dedicated
        # thread performs database heartbeats between boundaries.
        yield ownership_ok
    finally:
        stopped.set()
        thread.join(timeout=1)


def _finish_claim(job_id: UUID, worker_id: str | None, succeeded: bool, error: str | None = None) -> bool:
    """Atomically finalize only the lease still owned by this worker."""
    with SessionLocal() as db:
        owner_condition = (
            AsyncJob.lease_owner == worker_id
            if worker_id is not None
            else AsyncJob.lease_owner.is_(None)
        )
        owned_running = (
            AsyncJob.id == job_id,
            AsyncJob.status == "running",
            owner_condition,
        )
        now = utcnow()
        common_values = {
            "lease_owner": None,
            "lease_expires_at": None,
            "heartbeat_at": now,
        }

        # Cancellation gets the first and last CAS opportunity.  A worker that
        # no longer owns the lease cannot cancel or complete its successor.
        cancelled = cast(
            CursorResult,
            db.execute(
                update(AsyncJob)
                .where(*owned_running, AsyncJob.cancel_requested.is_(True))
                .values(
                    **common_values,
                    status="cancelled",
                    current_step="cancelled",
                    retryable=False,
                    next_retry_at=None,
                )
            ),
        )
        if cancelled.rowcount == 1:
            db.commit()
            return True

        job = db.scalar(
            select(AsyncJob).where(
                *owned_running,
                AsyncJob.cancel_requested.is_(False),
            )
        )
        if job is None:
            return False

        values: dict = dict(common_values)
        if succeeded:
            values.update(
                status="completed",
                progress=100,
                current_step="completed",
                retryable=False,
                next_retry_at=None,
                error=None,
            )
        elif job.attempt_count < job.max_attempts:
            delay = RETRY_DELAYS_SECONDS[min(job.attempt_count - 1, len(RETRY_DELAYS_SECONDS) - 1)]
            # Agent runs use an explicit retrying state.  This makes a scheduled
            # automatic retry distinguishable from a user-requested requeue and
            # lets the agent runtime reuse it instead of adding a second job.
            retry_status = "retrying" if job.job_type == "agent_run" else "queued"
            values.update(
                status=retry_status,
                current_step="retry_scheduled",
                retryable=True,
                next_retry_at=now + timedelta(seconds=delay),
                error=(error or job.error or "job failed")[:1000],
            )
        else:
            values.update(
                status="failed",
                current_step="failed",
                retryable=False,
                next_retry_at=None,
                error=(error or job.error or "job failed")[:1000],
            )

        finalized = cast(
            CursorResult,
            db.execute(
                update(AsyncJob)
                .where(
                    *owned_running,
                    AsyncJob.cancel_requested.is_(False),
                    AsyncJob.attempt_count == job.attempt_count,
                )
                .values(**values)
            ),
        )
        if finalized.rowcount == 1 and not succeeded and job.job_type == "agent_run" and job.attempt_count < job.max_attempts:
            db.execute(
                update(AgentRun)
                .where(
                    AgentRun.id == job.entity_id,
                    AgentRun.tenant_id == job.tenant_id,
                    AgentRun.status == "failed",
                )
                .values(
                    status="queued",
                    completed_at=None,
                    error_code=None,
                    error_message=None,
                    agent_summary="上次执行失败，已安排自动重试。",
                    last_observation="上次执行失败，后台任务将按退避策略自动重试。",
                    next_action="retry_scheduled",
                )
            )
        db.commit()
        if finalized.rowcount == 1:
            return True

        cancelled = cast(
            CursorResult,
            db.execute(
                update(AsyncJob)
                .where(*owned_running, AsyncJob.cancel_requested.is_(True))
                .values(
                    **common_values,
                    status="cancelled",
                    current_step="cancelled",
                    retryable=False,
                    next_retry_at=None,
                )
            ),
        )
        db.commit()
        return cancelled.rowcount == 1


def dispatch_job(job_id: UUID, worker_id: str | None = None) -> bool:
    with SessionLocal() as db:
        job = db.get(AsyncJob, job_id)
        if job is None or job.status not in {"queued", "retrying", "running"}:
            return False
        if worker_id and job.lease_owner != worker_id:
            return False
        principal = Principal(tenant_id=job.tenant_id, user_id=job.created_by, role="admin")
        job_type = job.job_type
        entity_id = job.entity_id
        if worker_id is None and job_type == "agent_run" and job.status in {"queued", "retrying"}:
            job.status = "running"
            job.current_step = "running"
            job.heartbeat_at = utcnow()
            job.attempt_count += 1
            job.next_retry_at = None
            db.commit()
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
            # The runtime persists after every workflow boundary.  Keep the
            # worker lease alive at those boundaries without changing its public
            # call signature (tests and direct callers still pass only run_id).
            if worker_id is None:
                succeeded = process_agent_run(entity_id)
            else:
                with maintain_job_lease(job_id, worker_id) as checkpoint:
                    with agent_run_heartbeat(checkpoint):
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
        finalized = _finish_claim(job_id, worker_id, succeeded, error)
        return succeeded and (finalized if job_type == "agent_run" else True)
    except Exception as exc:
        _finish_claim(job_id, worker_id, False, str(exc))
        return False


def process_next_job() -> bool:
    worker_id = f"worker-{uuid4()}"
    job_id = claim_next_job(worker_id)
    return dispatch_job(job_id, worker_id) if job_id else False
