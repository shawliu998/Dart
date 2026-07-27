"""Add document and requirement analysis revisions.

Revision ID: 0009_document_analysis_revisions
Revises: 0008_agent_run_scope_outcome
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_document_analysis_revisions"
down_revision = "0008_agent_run_scope_outcome"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    document_columns = {item["name"] for item in inspector.get_columns("documents")}
    if "parse_revision" not in document_columns:
        op.add_column(
            "documents",
            sa.Column("parse_revision", sa.Integer(), nullable=False, server_default="1"),
        )
    requirement_columns = {item["name"] for item in inspector.get_columns("requirements")}
    missing_columns = {
        "extraction_revision",
        "is_current",
        "superseded_at",
    } - requirement_columns
    with op.batch_alter_table("requirements") as batch:
        if "extraction_revision" in missing_columns:
            batch.add_column(
                sa.Column(
                    "extraction_revision", sa.Integer(), nullable=False, server_default="1"
                )
            )
        if "is_current" in missing_columns:
            batch.add_column(
                sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.true())
            )
        if "superseded_at" in missing_columns:
            batch.add_column(
                sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True)
            )
    inspector = sa.inspect(bind)
    unique_constraints = {
        item["name"]: tuple(item["column_names"])
        for item in inspector.get_unique_constraints("requirements")
    }
    expected_unique = (
        "project_id",
        "source_document_id",
        "source_page",
        "original_hash",
        "extraction_revision",
    )
    indexes = {item["name"] for item in inspector.get_indexes("requirements")}
    with op.batch_alter_table("requirements") as batch:
        if unique_constraints.get("uq_requirement_source") != expected_unique:
            batch.drop_constraint("uq_requirement_source", type_="unique")
            batch.create_unique_constraint("uq_requirement_source", list(expected_unique))
        if "ix_requirements_is_current" not in indexes:
            batch.create_index("ix_requirements_is_current", ["is_current"])


def downgrade() -> None:
    with op.batch_alter_table("requirements") as batch:
        batch.drop_index("ix_requirements_is_current")
        batch.drop_constraint("uq_requirement_source", type_="unique")
        batch.create_unique_constraint(
            "uq_requirement_source",
            ["project_id", "source_document_id", "source_page", "original_hash"],
        )
        batch.drop_column("superseded_at")
        batch.drop_column("is_current")
        batch.drop_column("extraction_revision")
    op.drop_column("documents", "parse_revision")
