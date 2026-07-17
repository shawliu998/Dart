"""Add safe provenance fields to append-only model run records.

Revision ID: 0004_model_run_provenance
Revises: 0003_agent_runtime
"""

import sqlalchemy as sa

from alembic import op

revision = "0004_model_run_provenance"
down_revision = "0003_agent_runtime"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("output_schema", sa.Column("output_schema", sa.String(length=120), nullable=True)),
    ("source_document_id", sa.Column("source_document_id", sa.Uuid(), nullable=True)),
    ("source_page", sa.Column("source_page", sa.Integer(), nullable=True)),
    ("error_code", sa.Column("error_code", sa.String(length=100), nullable=True)),
    ("metadata", sa.Column("metadata", sa.JSON(), nullable=True)),
]


def _columns() -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns("model_runs")}


def upgrade() -> None:
    if "model_runs" not in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    existing = _columns()
    for name, column in _COLUMNS:
        if name not in existing:
            op.add_column("model_runs", column)


def downgrade() -> None:
    if "model_runs" not in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    existing = _columns()
    for name, _column in reversed(_COLUMNS):
        if name in existing:
            op.drop_column("model_runs", name)
