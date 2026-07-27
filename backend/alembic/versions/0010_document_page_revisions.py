"""Preserve parsed page text across document analysis revisions.

Revision ID: 0010_document_page_revisions
Revises: 0009_document_analysis_revisions
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_document_page_revisions"
down_revision = "0009_document_analysis_revisions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {item["name"] for item in inspector.get_columns("document_pages")}
    constraints = {item["name"]: tuple(item["column_names"]) for item in inspector.get_unique_constraints("document_pages")}
    expected = ("document_id", "page_number", "parse_revision")
    with op.batch_alter_table("document_pages") as batch:
        if "parse_revision" not in columns:
            batch.add_column(sa.Column("parse_revision", sa.Integer(), nullable=False, server_default="1"))
        if constraints.get("uq_document_page") != expected:
            batch.drop_constraint("uq_document_page", type_="unique")
            batch.create_unique_constraint("uq_document_page", list(expected))
    indexes = {item["name"] for item in sa.inspect(bind).get_indexes("async_jobs")}
    if "uq_async_jobs_active_document_analysis" not in indexes:
        predicate = (
            "job_type IN ('document_parse', 'requirement_extraction', "
            "'document_reanalysis') AND status IN ('queued', 'running', 'retrying')"
        )
        op.create_index(
            "uq_async_jobs_active_document_analysis",
            "async_jobs",
            ["tenant_id", "entity_id"],
            unique=True,
            sqlite_where=sa.text(predicate),
            postgresql_where=sa.text(predicate),
        )


def downgrade() -> None:
    op.drop_index("uq_async_jobs_active_document_analysis", table_name="async_jobs")
    with op.batch_alter_table("document_pages") as batch:
        batch.drop_constraint("uq_document_page", type_="unique")
        batch.create_unique_constraint("uq_document_page", ["document_id", "page_number"])
        batch.drop_column("parse_revision")
