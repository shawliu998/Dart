"""Add immutable, user-visible response revisions.

Revision ID: 0012_response_revisions
Revises: 0011_audit_request_ids
"""

from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "0012_response_revisions"
down_revision = "0011_audit_request_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("response_items")}
    if "revision_number" not in columns:
        with op.batch_alter_table("response_items") as batch:
            batch.add_column(
                sa.Column(
                    "revision_number",
                    sa.Integer(),
                    nullable=False,
                    server_default="1",
                )
            )

    tables = set(sa.inspect(bind).get_table_names())
    if "response_revisions" not in tables:
        op.create_table(
            "response_revisions",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("tenant_id", sa.Uuid(), nullable=False),
            sa.Column("response_item_id", sa.Uuid(), nullable=False),
            sa.Column("revision_number", sa.Integer(), nullable=False),
            sa.Column("event_type", sa.String(length=20), nullable=False),
            sa.Column("draft_text", sa.Text(), nullable=True),
            sa.Column("edited_text", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("generation_version", sa.Integer(), nullable=False),
            sa.Column("created_by", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "event_type IN ('baseline', 'generated', 'edited', 'approved')",
                name="ck_response_revisions_event_type",
            ),
            sa.ForeignKeyConstraint(
                ["response_item_id"],
                ["response_items.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "response_item_id",
                "revision_number",
                name="uq_response_revision_number",
            ),
        )
        op.create_index(
            "ix_response_revisions_item_number",
            "response_revisions",
            ["response_item_id", "revision_number"],
        )
        op.create_index(
            "ix_response_revisions_response_item_id",
            "response_revisions",
            ["response_item_id"],
        )
        op.create_index(
            "ix_response_revisions_tenant",
            "response_revisions",
            ["tenant_id"],
        )

    response_items = sa.table(
        "response_items",
        sa.column("id", sa.Uuid()),
        sa.column("tenant_id", sa.Uuid()),
        sa.column("revision_number", sa.Integer()),
        sa.column("draft_text", sa.Text()),
        sa.column("edited_text", sa.Text()),
        sa.column("status", sa.String()),
        sa.column("generation_version", sa.Integer()),
        sa.column("created_by", sa.Uuid()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    response_revisions = sa.table(
        "response_revisions",
        sa.column("id", sa.Uuid()),
        sa.column("tenant_id", sa.Uuid()),
        sa.column("response_item_id", sa.Uuid()),
        sa.column("revision_number", sa.Integer()),
        sa.column("event_type", sa.String()),
        sa.column("draft_text", sa.Text()),
        sa.column("edited_text", sa.Text()),
        sa.column("status", sa.String()),
        sa.column("generation_version", sa.Integer()),
        sa.column("created_by", sa.Uuid()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    existing_ids = set(
        bind.execute(sa.select(response_revisions.c.response_item_id)).scalars()
    )
    rows = bind.execute(sa.select(response_items)).mappings()
    for row in rows:
        if row["id"] in existing_ids:
            continue
        bind.execute(
            response_revisions.insert().values(
                id=uuid4(),
                tenant_id=row["tenant_id"],
                response_item_id=row["id"],
                revision_number=row["revision_number"],
                event_type="baseline",
                draft_text=row["draft_text"],
                edited_text=row["edited_text"],
                status=row["status"],
                generation_version=row["generation_version"],
                created_by=row["created_by"],
                created_at=row["created_at"],
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "response_revisions" in tables:
        op.drop_index(
            "ix_response_revisions_tenant",
            table_name="response_revisions",
        )
        op.drop_index(
            "ix_response_revisions_response_item_id",
            table_name="response_revisions",
        )
        op.drop_index(
            "ix_response_revisions_item_number",
            table_name="response_revisions",
        )
        op.drop_table("response_revisions")
    columns = {
        column["name"]
        for column in sa.inspect(bind).get_columns("response_items")
    }
    if "revision_number" in columns:
        with op.batch_alter_table("response_items") as batch:
            batch.drop_column("revision_number")
