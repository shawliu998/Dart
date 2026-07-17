from __future__ import annotations

from datetime import timedelta
import time
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base, utcnow
from app.auth.dependencies import Principal
from app.models.entities import AgentRun, AsyncJob
from app.services import agent_runtime, jobs


@pytest.fixture
def queue_session(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(jobs, "SessionLocal", factory)
    try:
        yield factory
    finally:
        engine.dispose()


def _job(session, *, job_type: str = "agent_run", **kwargs) -> AsyncJob:
    job = AsyncJob(
        tenant_id=uuid4(),
        created_by=uuid4(),
        job_type=job_type,
        entity_id=uuid4(),
        **kwargs,
    )
    session.add(job)
    session.commit()
    return job


def _run(session) -> AgentRun:
    run = AgentRun(
        tenant_id=uuid4(),
        project_id=uuid4(),
        workflow_type="test",
        goal="test job reliability",
        created_by=uuid4(),
    )
    session.add(run)
    session.commit()
    return run


def test_claim_is_exclusive_and_expired_lease_is_recovered(queue_session) -> None:
    with queue_session() as db:
        job = _job(db)
        job_id = job.id

    assert jobs.claim_next_job("worker-a") == job_id
    assert jobs.claim_next_job("worker-b") is None

    with queue_session() as db:
        job = db.get(AsyncJob, job_id)
        assert job is not None
        assert job.status == "running"
        assert job.lease_owner == "worker-a"
        assert job.attempt_count == 1
        job.lease_expires_at = utcnow() - timedelta(seconds=1)
        db.commit()

    assert jobs.claim_next_job("worker-b") == job_id
    with queue_session() as db:
        job = db.get(AsyncJob, job_id)
        assert job is not None
        assert job.lease_owner == "worker-b"
        assert job.attempt_count == 2


def test_heartbeat_requires_lease_owner_and_respects_cancel(queue_session) -> None:
    with queue_session() as db:
        job = _job(db)
        job_id = job.id
    assert jobs.claim_next_job("worker-a") == job_id
    assert jobs.heartbeat_job(job_id, "worker-b") is False
    assert jobs.heartbeat_job(job_id, "worker-a") is True
    with queue_session() as db:
        job = db.get(AsyncJob, job_id)
        assert job is not None
        job.cancel_requested = True
        db.commit()
    assert jobs.heartbeat_job(job_id, "worker-a") is False


def test_periodic_heartbeat_renews_during_a_long_agent_step(monkeypatch) -> None:
    calls: list[tuple[object, str]] = []
    monkeypatch.setattr(jobs, "HEARTBEAT_INTERVAL_SECONDS", 0.01)
    monkeypatch.setattr(
        jobs,
        "heartbeat_job",
        lambda job_id, worker_id: not calls.append((job_id, worker_id)),
    )
    job_id = uuid4()
    with jobs.maintain_job_lease(job_id, "worker-long") as checkpoint:
        time.sleep(0.035)
        assert checkpoint() is True
    assert len(calls) >= 2


def test_dispatch_releases_lease_and_schedules_retry(queue_session, monkeypatch) -> None:
    with queue_session() as db:
        successful = _job(db)
        failing = _job(db)
        successful_id = successful.id
        failing_id = failing.id

    monkeypatch.setattr(jobs, "process_agent_run", lambda _run_id: True)
    assert jobs.claim_next_job("worker-success") == successful_id
    assert jobs.dispatch_job(successful_id, "worker-success") is True

    with queue_session() as db:
        completed = db.get(AsyncJob, successful_id)
        assert completed is not None
        assert completed.status == "completed"
        assert completed.lease_owner is None
        assert completed.lease_expires_at is None

    monkeypatch.setattr(jobs, "process_agent_run", lambda _run_id: False)
    assert jobs.claim_next_job("worker-failure") == failing_id
    assert jobs.dispatch_job(failing_id, "worker-failure") is False

    with queue_session() as db:
        retried = db.get(AsyncJob, failing_id)
        assert retried is not None
        assert retried.status == "retrying"
        assert retried.current_step == "retry_scheduled"
        assert retried.next_retry_at is not None
        assert retried.lease_owner is None


def test_stale_worker_cannot_finish_a_reclaimed_job(queue_session) -> None:
    with queue_session() as db:
        job = _job(db)
        job.status = "running"
        job.lease_owner = "worker-b"
        job.attempt_count = 2
        db.commit()
        job_id = job.id

    assert jobs._finish_claim(job_id, "worker-a", True) is False
    with queue_session() as db:
        current = db.get(AsyncJob, job_id)
        assert current is not None
        assert current.status == "running"
        assert current.lease_owner == "worker-b"
        assert current.attempt_count == 2


def test_agent_enqueue_is_idempotent_and_manual_retry_reuses_scheduled_job(queue_session) -> None:
    with queue_session() as db:
        run = _run(db)
        first = agent_runtime.enqueue_agent_run_job(db, run, created_by=run.created_by)
        second = agent_runtime.enqueue_agent_run_job(db, run, created_by=run.created_by)
        db.commit()
        assert first.id == second.id
        assert db.query(AsyncJob).filter_by(job_type="agent_run", entity_id=run.id).count() == 1

        first.status = "retrying"
        first.current_step = "retry_scheduled"
        first.next_retry_at = utcnow() + timedelta(minutes=2)
        db.commit()
        retried = agent_runtime.enqueue_agent_run_job(
            db, run, created_by=run.created_by, immediate=True
        )
        db.commit()
        assert retried.id == first.id
        assert retried.status == "queued"
        assert retried.next_retry_at is None


def test_retry_run_reuses_automatic_retry_and_clears_terminal_timestamp(queue_session) -> None:
    with queue_session() as db:
        run = _run(db)
        run.status = "failed"
        run.completed_at = utcnow()
        run.error_code = "RUNTIME_ERROR"
        run.error_message = "transient failure"
        scheduled = agent_runtime.enqueue_agent_run_job(
            db, run, created_by=run.created_by
        )
        scheduled.status = "retrying"
        scheduled.current_step = "retry_scheduled"
        scheduled.next_retry_at = utcnow() + timedelta(minutes=2)
        db.commit()
        principal = Principal(
            tenant_id=run.tenant_id, user_id=run.created_by, role="admin"
        )

        bundle = agent_runtime.retry_run(db, principal, run.id)

        assert bundle["run"].status == "queued"
        assert bundle["run"].completed_at is None
        assert db.query(AsyncJob).filter_by(
            job_type="agent_run", entity_id=run.id
        ).count() == 1
        assert scheduled.status == "queued"
        assert scheduled.next_retry_at is None


def test_automatic_retry_returns_failed_agent_run_to_pollable_queue(queue_session) -> None:
    with queue_session() as db:
        run = _run(db)
        job = agent_runtime.enqueue_agent_run_job(db, run, created_by=run.created_by)
        run.status = "failed"
        run.completed_at = utcnow()
        job.status = "running"
        job.lease_owner = "worker-a"
        job.attempt_count = 1
        db.commit()
        run_id, job_id = run.id, job.id

    assert jobs._finish_claim(job_id, "worker-a", False, "transient failure") is True
    with queue_session() as db:
        retried = db.get(AsyncJob, job_id)
        run = db.get(AgentRun, run_id)
        assert retried is not None and run is not None
        assert retried.status == "retrying"
        assert run.status == "queued"
        assert run.completed_at is None
        assert run.error_code is None and run.error_message is None
        assert run.next_action == "retry_scheduled"


def test_cancel_run_cancels_retrying_job_and_marks_running_job_for_boundary_stop(queue_session) -> None:
    with queue_session() as db:
        queued_run = _run(db)
        queued_job = agent_runtime.enqueue_agent_run_job(db, queued_run, created_by=queued_run.created_by)
        queued_job.status = "retrying"
        running_run = _run(db)
        running_job = agent_runtime.enqueue_agent_run_job(db, running_run, created_by=running_run.created_by)
        running_run.status = "running"
        running_job.status, running_job.lease_owner = "running", "worker-a"
        db.commit()

        queued_principal = Principal(
            tenant_id=queued_run.tenant_id, user_id=queued_run.created_by, role="admin"
        )
        running_principal = Principal(
            tenant_id=running_run.tenant_id, user_id=running_run.created_by, role="admin"
        )
        agent_runtime.cancel_run(db, queued_principal, queued_run.id)
        agent_runtime.cancel_run(db, running_principal, running_run.id)

        cancelled = db.get(AsyncJob, queued_job.id)
        assert cancelled is not None
        assert cancelled.status == "cancelled"
        assert cancelled.cancel_requested is True
        running = db.get(AsyncJob, running_job.id)
        assert running is not None
        assert running.status == "running"
        assert running.cancel_requested is True

    assert jobs._finish_claim(running_job.id, "worker-a", True) is True
    with queue_session() as db:
        finished = db.get(AsyncJob, running_job.id)
        assert finished is not None
        assert finished.status == "cancelled"
