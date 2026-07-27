"""Add persisted state for the bounded autonomous draft loop.

Revision ID: 0006_autonomous_draft_agent
Revises: 0005_response_workbench
"""

import sqlalchemy as sa

from alembic import op

revision = "0006_autonomous_draft_agent"
down_revision = "0005_response_workbench"
branch_labels = None
depends_on = None


_COLUMNS = [
    ("mode", sa.Column("mode", sa.String(length=30), nullable=False, server_default="autonomous_draft")),
    ("plan_json", sa.Column("plan_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'"))),
    ("iteration", sa.Column("iteration", sa.Integer(), nullable=False, server_default="0")),
    ("max_iterations", sa.Column("max_iterations", sa.Integer(), nullable=False, server_default="20")),
    ("current_action", sa.Column("current_action", sa.String(length=100), nullable=True)),
    ("last_observation", sa.Column("last_observation", sa.Text(), nullable=True)),
    ("next_action", sa.Column("next_action", sa.String(length=100), nullable=True)),
    ("agent_summary", sa.Column("agent_summary", sa.Text(), nullable=True)),
    ("completion_reason", sa.Column("completion_reason", sa.String(length=100), nullable=True)),
]


def upgrade() -> None:
    bind = op.get_bind()
    if "agent_runs" not in set(sa.inspect(bind).get_table_names()):
        return
    existing = {column["name"] for column in sa.inspect(bind).get_columns("agent_runs")}
    for name, column in _COLUMNS:
        if name not in existing:
            op.add_column("agent_runs", column)
    # Every run created before this migration used the three-gate supervised runtime.
    # Preserve that meaning while retaining autonomous_draft as the default for new rows.
    op.execute(sa.text("UPDATE agent_runs SET mode = 'supervised'"))


def downgrade() -> None:
    bind = op.get_bind()
    if "agent_runs" not in set(sa.inspect(bind).get_table_names()):
        return
    existing = {column["name"] for column in sa.inspect(bind).get_columns("agent_runs")}
    for name, _column in reversed(_COLUMNS):
        if name in existing:
            op.drop_column("agent_runs", name)
