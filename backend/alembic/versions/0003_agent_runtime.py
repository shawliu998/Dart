"""P1 agent runtime persistence.

Creates the agent runtime tables (agent_runs, agent_step_runs, agent_events,
approval_requests, agent_artifacts) and extends async_jobs with durable queue
fields. All DDL is explicit (no metadata.create_all) and uses types that render
on both SQLite and PostgreSQL.

Earlier revisions create the schema via Base.metadata.create_all, so on fresh
databases these tables/columns may already exist; every statement here is
guarded by an existence check and is therefore safe on both fresh and legacy
databases.

Revision ID: 0003_agent_runtime
Revises: 0002_phase2_to_5
"""

import sqlalchemy as sa

from alembic import op

revision = "0003_agent_runtime"
down_revision = "0002_phase2_to_5"
branch_labels = None
depends_on = None

_AGENT_TABLES = [
    "agent_artifacts",
    "approval_requests",
    "agent_events",
    "agent_step_runs",
    "agent_runs",
]

_ASYNC_JOB_QUEUE_COLUMNS = [
    ("lease_owner", sa.Column("lease_owner", sa.String(length=100), nullable=True)),
    (
        "lease_expires_at",
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
    ),
    ("heartbeat_at", sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True)),
    (
        "attempt_count",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
    ),
    (
        "max_attempts",
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
    ),
    (
        "cancel_requested",
        sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()),
    ),
    (
        "input_revision",
        sa.Column("input_revision", sa.Integer(), nullable=False, server_default="1"),
    ),
    ("result_hash", sa.Column("result_hash", sa.String(length=64), nullable=True)),
    (
        "next_retry_at",
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
    ),
]


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
    ]


def _create_agent_runs(existing: set[str]) -> None:
    if "agent_runs" in existing:
        return
    op.create_table(
        "agent_runs",
        *_audit_columns(),
        sa.Column(
            "project_id", sa.Uuid(), sa.ForeignKey("tender_projects.id"), nullable=False
        ),
        sa.Column("workflow_type", sa.String(length=100), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("current_step", sa.String(length=200), nullable=True),
        sa.Column("input_revision", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index("ix_agent_runs_tenant_id", "agent_runs", ["tenant_id"])
    op.create_index("ix_agent_runs_project_id", "agent_runs", ["project_id"])
    op.create_index(
        "ix_agent_runs_tenant_project", "agent_runs", ["tenant_id", "project_id"]
    )


def _create_agent_step_runs(existing: set[str]) -> None:
    if "agent_step_runs" in existing:
        return
    op.create_table(
        "agent_step_runs",
        *_audit_columns(),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column("step_key", sa.String(length=200), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=True),
        sa.Column("output_hash", sa.String(length=64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.UniqueConstraint("run_id", "sequence", name="uq_agent_step_run_sequence"),
    )
    op.create_index("ix_agent_step_runs_tenant_id", "agent_step_runs", ["tenant_id"])
    op.create_index("ix_agent_step_runs_run_id", "agent_step_runs", ["run_id"])
    op.create_index(
        "ix_agent_step_runs_run_status", "agent_step_runs", ["run_id", "status"]
    )


def _create_agent_events(existing: set[str]) -> None:
    if "agent_events" in existing:
        return
    op.create_table(
        "agent_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column(
            "step_run_id", sa.Uuid(), sa.ForeignKey("agent_step_runs.id"), nullable=True
        ),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("run_id", "sequence", name="uq_agent_event_sequence"),
    )
    op.create_index("ix_agent_events_tenant_id", "agent_events", ["tenant_id"])
    op.create_index("ix_agent_events_run_id", "agent_events", ["run_id"])
    op.create_index("ix_agent_events_step_run_id", "agent_events", ["step_run_id"])


def _create_approval_requests(existing: set[str]) -> None:
    if "approval_requests" in existing:
        return
    op.create_table(
        "approval_requests",
        *_audit_columns(),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column(
            "step_run_id", sa.Uuid(), sa.ForeignKey("agent_step_runs.id"), nullable=True
        ),
        sa.Column("approval_type", sa.String(length=60), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("impact_summary", sa.Text(), nullable=True),
        sa.Column("reversible", sa.Boolean(), nullable=False),
        sa.Column("requested_role", sa.String(length=60), nullable=False),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_approval_requests_tenant_id", "approval_requests", ["tenant_id"])
    op.create_index("ix_approval_requests_run_id", "approval_requests", ["run_id"])
    op.create_index(
        "ix_approval_requests_step_run_id", "approval_requests", ["step_run_id"]
    )
    op.create_index(
        "ix_approval_requests_run_status", "approval_requests", ["run_id", "status"]
    )


def _create_agent_artifacts(existing: set[str]) -> None:
    if "agent_artifacts" in existing:
        return
    op.create_table(
        "agent_artifacts",
        *_audit_columns(),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column(
            "step_run_id", sa.Uuid(), sa.ForeignKey("agent_step_runs.id"), nullable=True
        ),
        sa.Column("artifact_type", sa.String(length=60), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
    )
    op.create_index("ix_agent_artifacts_tenant_id", "agent_artifacts", ["tenant_id"])
    op.create_index("ix_agent_artifacts_run_id", "agent_artifacts", ["run_id"])
    op.create_index("ix_agent_artifacts_step_run_id", "agent_artifacts", ["step_run_id"])
    op.create_index(
        "ix_agent_artifacts_run_type", "agent_artifacts", ["run_id", "artifact_type"]
    )


def upgrade() -> None:
    existing = _table_names()
    _create_agent_runs(existing)
    _create_agent_step_runs(existing)
    _create_agent_events(existing)
    _create_approval_requests(existing)
    _create_agent_artifacts(existing)

    if "async_jobs" in _table_names():
        async_job_columns = _column_names("async_jobs")
        for column_name, column in _ASYNC_JOB_QUEUE_COLUMNS:
            if column_name not in async_job_columns:
                op.add_column("async_jobs", column)


def downgrade() -> None:
    if "async_jobs" in _table_names():
        async_job_columns = _column_names("async_jobs")
        for column_name, _column in reversed(_ASYNC_JOB_QUEUE_COLUMNS):
            if column_name in async_job_columns:
                op.drop_column("async_jobs", column_name)

    existing = _table_names()
    for table_name in _AGENT_TABLES:
        if table_name in existing:
            op.drop_table(table_name)
