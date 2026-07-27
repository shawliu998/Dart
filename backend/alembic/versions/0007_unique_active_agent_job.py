"""Guarantee one active queue job per agent run.

Revision ID: 0007_unique_active_agent_job
Revises: 0006_autonomous_draft_agent
"""

import sqlalchemy as sa

from alembic import op

revision = "0007_unique_active_agent_job"
down_revision = "0006_autonomous_draft_agent"
branch_labels = None
depends_on = None

_INDEX = "uq_async_jobs_active_agent_run"
_PREDICATE = sa.text(
    "job_type = 'agent_run' AND status IN ('queued', 'running', 'retrying')"
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "async_jobs" not in set(inspector.get_table_names()):
        return
    indexes = {item["name"] for item in inspector.get_indexes("async_jobs")}
    if _INDEX in indexes:
        return
    # Older runtimes could enqueue both an automatic retry and a manual retry.
    # Preserve the oldest active job and make later duplicates terminal before
    # adding the database-level guard.
    op.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY tenant_id, entity_id
                           ORDER BY created_at, id
                       ) AS active_rank
                FROM async_jobs
                WHERE job_type = 'agent_run'
                  AND status IN ('queued', 'running', 'retrying')
            )
            UPDATE async_jobs
            SET status = 'cancelled',
                current_step = 'cancelled',
                retryable = FALSE,
                cancel_requested = TRUE,
                next_retry_at = NULL,
                lease_owner = NULL,
                lease_expires_at = NULL
            WHERE id IN (SELECT id FROM ranked WHERE active_rank > 1)
            """
        )
    )
    op.create_index(
        _INDEX,
        "async_jobs",
        ["tenant_id", "job_type", "entity_id"],
        unique=True,
        sqlite_where=_PREDICATE,
        postgresql_where=_PREDICATE,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "async_jobs" not in set(inspector.get_table_names()):
        return
    indexes = {item["name"] for item in inspector.get_indexes("async_jobs")}
    if _INDEX in indexes:
        op.drop_index(_INDEX, table_name="async_jobs")
