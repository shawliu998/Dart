"""Add tenant-scoped runtime AI settings.

Revision ID: 0013_workspace_ai_settings
Revises: 0012_response_revisions
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_workspace_ai_settings"
down_revision = "0012_response_revisions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "workspace_ai_settings" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "workspace_ai_settings",
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("base_url", sa.String(length=500), nullable=True),
        sa.Column("model", sa.String(length=150), nullable=True),
        sa.Column("secret_ref", sa.String(length=200), nullable=True),
        sa.Column("capability_profile", sa.JSON(), nullable=False),
        sa.Column("last_test_status", sa.String(length=20), nullable=False),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=100), nullable=True),
        sa.Column("last_test_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_workspace_ai_settings_tenant"),
    )
    op.create_index(
        "ix_workspace_ai_settings_tenant_id",
        "workspace_ai_settings",
        ["tenant_id"],
    )


def downgrade() -> None:
    if "workspace_ai_settings" not in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.drop_index(
        "ix_workspace_ai_settings_tenant_id",
        table_name="workspace_ai_settings",
    )
    op.drop_table("workspace_ai_settings")
