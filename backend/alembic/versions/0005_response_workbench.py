"""Persist editable, evidence-bound tender response drafts.

Revision ID: 0005_response_workbench
Revises: 0004_model_run_provenance
"""

import sqlalchemy as sa

from alembic import op

revision = "0005_response_workbench"
down_revision = "0004_model_run_provenance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "response_items" not in tables:
        op.create_table(
            "response_items",
            sa.Column("project_id", sa.Uuid(), nullable=False),
            sa.Column("requirement_id", sa.Uuid(), nullable=False),
            sa.Column("model_run_id", sa.Uuid(), nullable=True),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="not_started"),
            sa.Column("response_strategy", sa.Text(), nullable=True),
            sa.Column("draft_text", sa.Text(), nullable=True),
            sa.Column("edited_text", sa.Text(), nullable=True),
            sa.Column("missing_information", sa.JSON(), nullable=False),
            sa.Column("risk_notes", sa.JSON(), nullable=False),
            sa.Column("confidence", sa.Numeric(precision=4, scale=3), nullable=True),
            sa.Column("generation_version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("reviewed_by", sa.Uuid(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("tenant_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_by", sa.Uuid(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.CheckConstraint(
                "status IN ('not_started', 'drafted', 'needs_review', 'missing_evidence', "
                "'approved', 'excluded')",
                name="ck_response_items_status",
            ),
            sa.ForeignKeyConstraint(["project_id"], ["tender_projects.id"]),
            sa.ForeignKeyConstraint(["requirement_id"], ["requirements.id"]),
            sa.ForeignKeyConstraint(["model_run_id"], ["model_runs.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("project_id", "requirement_id", name="uq_response_item_requirement"),
        )
        op.create_index("ix_response_items_tenant_project", "response_items", ["tenant_id", "project_id"])
    if "response_evidence_links" not in tables:
        op.create_table(
            "response_evidence_links",
            sa.Column("response_item_id", sa.Uuid(), nullable=False),
            sa.Column("evidence_claim_id", sa.Uuid(), nullable=False),
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("tenant_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_by", sa.Uuid(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["response_item_id"], ["response_items.id"]),
            sa.ForeignKeyConstraint(["evidence_claim_id"], ["evidence_claims.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("response_item_id", "evidence_claim_id", name="uq_response_evidence_link"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "response_evidence_links" in tables:
        op.drop_table("response_evidence_links")
    if "response_items" in tables:
        op.drop_index("ix_response_items_tenant_project", table_name="response_items")
        op.drop_table("response_items")
