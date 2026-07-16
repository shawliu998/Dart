"""Phase 0 and Phase 1 initial schema."""

from alembic import op

revision = "0001_phase01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    import app.models  # noqa: F401
    from app.db.base import Base

    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    import app.models  # noqa: F401
    from app.db.base import Base

    Base.metadata.drop_all(bind=op.get_bind())
