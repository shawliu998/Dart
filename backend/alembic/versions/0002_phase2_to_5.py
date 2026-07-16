"""Phase 2 to 5 domain schema.

Revision ID: 0002_phase2_to_5
Revises: 0001_phase01
"""

from alembic import op

revision = "0002_phase2_to_5"
down_revision = "0001_phase01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    import app.models  # noqa: F401
    from app.db.base import Base

    Base.metadata.create_all(bind=op.get_bind())
    from sqlalchemy import inspect

    if "password_hash" not in {
        column["name"] for column in inspect(op.get_bind()).get_columns("users")
    }:
        import sqlalchemy as sa

        op.add_column("users", sa.Column("password_hash", sa.String(length=300), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in [
        "submission_packages",
        "package_items",
        "remediation_tasks",
        "amendment_impacts",
        "amendment_changes",
        "amendments",
        "consistency_issues",
        "compliance_checks",
        "evidence_matches",
        "evidence_claims",
        "evidence_assets",
    ]:
        op.drop_table(table_name) if bind.dialect.has_table(bind, table_name) else None
