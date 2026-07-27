"""Add scoped run outcomes and one active run per project.

Revision ID: 0008_agent_run_scope_outcome
Revises: 0007_unique_active_agent_job
"""

import sqlalchemy as sa

from alembic import op

revision = "0008_agent_run_scope_outcome"
down_revision = "0007_unique_active_agent_job"
branch_labels = None
depends_on = None

_INDEX = "uq_agent_runs_active_project"
_PREDICATE = sa.text(
    "status IN ('queued', 'planning', 'running', 'waiting_approval')"
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "agent_runs" not in tables:
        return

    run_columns = {column["name"] for column in inspector.get_columns("agent_runs")}
    if "scope" not in run_columns:
        op.add_column(
            "agent_runs",
            sa.Column(
                "scope",
                sa.String(length=60),
                nullable=False,
                server_default="full_bid_draft",
            ),
        )
    if "outcome" not in run_columns:
        op.add_column(
            "agent_runs",
            sa.Column("outcome", sa.String(length=30), nullable=True),
        )

    if "compliance_checks" in tables:
        compliance_columns = {
            column["name"] for column in inspector.get_columns("compliance_checks")
        }
        if "metadata" not in compliance_columns:
            op.add_column(
                "compliance_checks",
                sa.Column(
                    "metadata",
                    sa.JSON(),
                    nullable=False,
                    server_default=sa.text("'{}'"),
                ),
            )

    indexes = {item["name"] for item in sa.inspect(bind).get_indexes("agent_runs")}
    if _INDEX not in indexes:
        # Preserve the oldest active run and make any historical duplicates
        # terminal before installing the database race guard.
        op.execute(
            sa.text(
                """
                WITH ranked AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY tenant_id, project_id
                               ORDER BY created_at, id
                           ) AS active_rank
                    FROM agent_runs
                    WHERE status IN ('queued', 'planning', 'running', 'waiting_approval')
                )
                UPDATE agent_runs
                SET status = 'cancelled',
                    outcome = NULL,
                    cancel_requested = TRUE,
                    completed_at = CURRENT_TIMESTAMP,
                    completion_reason = 'duplicate_active_run_migration'
                WHERE id IN (SELECT id FROM ranked WHERE active_rank > 1)
                """
            )
        )
        if "async_jobs" in tables:
            op.execute(
                sa.text(
                    """
                    UPDATE async_jobs
                    SET status = 'cancelled',
                        current_step = 'cancelled',
                        retryable = FALSE,
                        cancel_requested = TRUE,
                        next_retry_at = NULL,
                        lease_owner = NULL,
                        lease_expires_at = NULL
                    WHERE job_type = 'agent_run'
                      AND status IN ('queued', 'running', 'retrying')
                      AND entity_id IN (
                          SELECT id FROM agent_runs
                          WHERE completion_reason = 'duplicate_active_run_migration'
                      )
                    """
                )
            )
        op.create_index(
            _INDEX,
            "agent_runs",
            ["tenant_id", "project_id"],
            unique=True,
            sqlite_where=_PREDICATE,
            postgresql_where=_PREDICATE,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "agent_runs" in tables:
        indexes = {item["name"] for item in inspector.get_indexes("agent_runs")}
        if _INDEX in indexes:
            op.drop_index(_INDEX, table_name="agent_runs")
        run_columns = {column["name"] for column in inspector.get_columns("agent_runs")}
        constraints = {
            item["name"] for item in inspector.get_check_constraints("agent_runs")
        }
        with op.batch_alter_table("agent_runs") as batch:
            if "ck_agent_runs_outcome" in constraints:
                batch.drop_constraint("ck_agent_runs_outcome", type_="check")
            if "ck_agent_runs_scope" in constraints:
                batch.drop_constraint("ck_agent_runs_scope", type_="check")
            if "outcome" in run_columns:
                batch.drop_column("outcome")
            if "scope" in run_columns:
                batch.drop_column("scope")
    if "compliance_checks" in tables:
        compliance_columns = {
            column["name"] for column in sa.inspect(bind).get_columns("compliance_checks")
        }
        if "metadata" in compliance_columns:
            op.drop_column("compliance_checks", "metadata")
