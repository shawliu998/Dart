from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_0007_deduplicates_and_guards_active_agent_jobs() -> None:
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0007_unique_active_agent_job.py"
    )
    spec = importlib.util.spec_from_file_location(
        "migration_0007_unique_active_agent_job", migration_path
    )
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite://")

    with engine.begin() as connection:
        connection.execute(
            sa.text(
                """
                CREATE TABLE async_jobs (
                    id VARCHAR(36) PRIMARY KEY,
                    tenant_id VARCHAR(36) NOT NULL,
                    job_type VARCHAR(40) NOT NULL,
                    entity_id VARCHAR(36) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    current_step VARCHAR(200) NOT NULL,
                    retryable BOOLEAN NOT NULL,
                    cancel_requested BOOLEAN NOT NULL,
                    next_retry_at DATETIME,
                    lease_owner VARCHAR(100),
                    lease_expires_at DATETIME,
                    created_at DATETIME NOT NULL
                )
                """
            )
        )
        for job_id, created_at in (("first", "2026-01-01"), ("duplicate", "2026-01-02")):
            connection.execute(
                sa.text(
                    """
                    INSERT INTO async_jobs
                        (id, tenant_id, job_type, entity_id, status, current_step,
                         retryable, cancel_requested, created_at)
                    VALUES (:id, 'tenant', 'agent_run', 'run', 'queued', 'queued',
                            TRUE, FALSE, :created_at)
                    """
                ),
                {"id": job_id, "created_at": created_at},
            )
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            migration.upgrade()

        rows = connection.execute(
            sa.text("SELECT id, status FROM async_jobs")
        ).tuples().all()
        states = {job_id: status for job_id, status in rows}
        assert states == {"first": "queued", "duplicate": "cancelled"}
        with pytest.raises(sa.exc.IntegrityError):
            connection.execute(
                sa.text(
                    """
                    INSERT INTO async_jobs
                        (id, tenant_id, job_type, entity_id, status, current_step,
                         retryable, cancel_requested, created_at)
                    VALUES ('third', 'tenant', 'agent_run', 'run', 'running', 'running',
                            TRUE, FALSE, '2026-01-03')
                    """
                )
            )
