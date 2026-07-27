from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_0008_deduplicates_active_project_runs_and_adds_runtime_fields() -> None:
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0008_agent_run_scope_outcome.py"
    )
    spec = importlib.util.spec_from_file_location(
        "migration_0008_agent_run_scope_outcome", migration_path
    )
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite://")

    with engine.begin() as connection:
        connection.execute(sa.text("""
            CREATE TABLE agent_runs (
                id VARCHAR(36) PRIMARY KEY,
                tenant_id VARCHAR(36) NOT NULL,
                project_id VARCHAR(36) NOT NULL,
                status VARCHAR(30) NOT NULL,
                cancel_requested BOOLEAN NOT NULL,
                completed_at DATETIME,
                completion_reason VARCHAR(100),
                created_at DATETIME NOT NULL
            )
        """))
        connection.execute(sa.text("""
            CREATE TABLE async_jobs (
                id VARCHAR(36) PRIMARY KEY,
                job_type VARCHAR(40) NOT NULL,
                entity_id VARCHAR(36) NOT NULL,
                status VARCHAR(20) NOT NULL,
                current_step VARCHAR(200) NOT NULL,
                retryable BOOLEAN NOT NULL,
                cancel_requested BOOLEAN NOT NULL,
                next_retry_at DATETIME,
                lease_owner VARCHAR(100),
                lease_expires_at DATETIME
            )
        """))
        connection.execute(sa.text("""
            CREATE TABLE compliance_checks (
                id VARCHAR(36) PRIMARY KEY
            )
        """))
        for run_id, created_at in (("first", "2026-01-01"), ("duplicate", "2026-01-02")):
            connection.execute(
                sa.text("""
                    INSERT INTO agent_runs
                        (id, tenant_id, project_id, status, cancel_requested, created_at)
                    VALUES (:id, 'tenant', 'project', 'queued', FALSE, :created_at)
                """),
                {"id": run_id, "created_at": created_at},
            )
            connection.execute(sa.text("""
                INSERT INTO async_jobs
                    (id, job_type, entity_id, status, current_step,
                     retryable, cancel_requested)
                VALUES (:id, 'agent_run', :entity_id, 'queued', 'queued', TRUE, FALSE)
            """), {"id": f"job-{run_id}", "entity_id": run_id})

        context = MigrationContext.configure(connection)
        with Operations.context(context):
            migration.upgrade()

        run_states = dict(connection.execute(
            sa.text("SELECT id, status FROM agent_runs")
        ).tuples().all())
        job_states = dict(connection.execute(
            sa.text("SELECT entity_id, status FROM async_jobs")
        ).tuples().all())
        assert run_states == {"first": "queued", "duplicate": "cancelled"}
        assert job_states == {"first": "queued", "duplicate": "cancelled"}
        assert {column["name"] for column in sa.inspect(connection).get_columns("agent_runs")} >= {
            "scope", "outcome"
        }
        assert "metadata" in {
            column["name"]
            for column in sa.inspect(connection).get_columns("compliance_checks")
        }
        with pytest.raises(sa.exc.IntegrityError):
            connection.execute(sa.text("""
                INSERT INTO agent_runs
                    (id, tenant_id, project_id, status, cancel_requested, created_at, scope)
                VALUES ('third', 'tenant', 'project', 'running', FALSE,
                        '2026-01-03', 'full_bid_draft')
            """))
