from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base, utcnow
from app.models.entities import AsyncJob
from app.services import jobs


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
        assert retried.status == "queued"
        assert retried.current_step == "retry_scheduled"
        assert retried.next_retry_at is not None
        assert retried.lease_owner is None
