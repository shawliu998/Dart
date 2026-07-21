"""Add non-null, server-generated request IDs to audit events.

Revision ID: 0011_audit_request_ids
Revises: 0010_document_page_revisions
"""

from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "0011_audit_request_ids"
down_revision = "0010_document_page_revisions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("audit_events")}
    if "request_id" not in columns:
        with op.batch_alter_table("audit_events") as batch:
            batch.add_column(sa.Column("request_id", sa.Uuid(), nullable=True))

    audit_events = sa.table(
        "audit_events",
        # Existing SQLite UUID values may include hyphens, while SQLAlchemy's
        # UUID bind processor normalizes them. Preserve the stored value while
        # addressing legacy rows during this data migration.
        sa.column("id", sa.String()),
        sa.column("request_id", sa.Uuid()),
    )
    legacy_ids = bind.execute(
        sa.select(audit_events.c.id).where(audit_events.c.request_id.is_(None))
    ).scalars()
    for event_id in legacy_ids:
        bind.execute(
            audit_events.update()
            .where(audit_events.c.id == event_id)
            .values(request_id=uuid4())
        )

    with op.batch_alter_table("audit_events") as batch:
        batch.alter_column("request_id", existing_type=sa.Uuid(), nullable=False)

    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("audit_events")}
    if "ix_audit_events_request_id" not in indexes:
        op.create_index("ix_audit_events_request_id", "audit_events", ["request_id"])


def downgrade() -> None:
    bind = op.get_bind()
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("audit_events")}
    if "ix_audit_events_request_id" in indexes:
        op.drop_index("ix_audit_events_request_id", table_name="audit_events")
    columns = {column["name"] for column in sa.inspect(bind).get_columns("audit_events")}
    if "request_id" in columns:
        with op.batch_alter_table("audit_events") as batch:
            batch.drop_column("request_id")
