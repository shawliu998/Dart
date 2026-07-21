from __future__ import annotations

import importlib.util
from pathlib import Path
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _migration():
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0011_audit_request_ids.py"
    spec = importlib.util.spec_from_file_location("migration_0011_audit_request_ids", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _legacy_audit_table(connection) -> None:
    connection.execute(sa.text("""
        CREATE TABLE audit_events (
            id VARCHAR(36) PRIMARY KEY, tenant_id VARCHAR(36) NOT NULL,
            project_id VARCHAR(36), actor_type VARCHAR(20) NOT NULL,
            actor_id VARCHAR(36) NOT NULL, action VARCHAR(100) NOT NULL,
            entity_type VARCHAR(60) NOT NULL, entity_id VARCHAR(36) NOT NULL,
            timestamp DATETIME NOT NULL, before_json JSON, after_json JSON,
            input_hash VARCHAR(64), output_hash VARCHAR(64), model_name VARCHAR(100),
            prompt_version VARCHAR(50), metadata JSON
        )
    """))


def test_0011_backfills_legacy_events_and_enforces_request_id() -> None:
    migration = _migration()
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        _legacy_audit_table(connection)
        for event_id in (uuid4(), uuid4()):
            connection.execute(
                sa.text("""INSERT INTO audit_events
                    (id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, timestamp, metadata)
                    VALUES (:id, 'tenant', 'human', 'user', 'test', 'entity', 'entity', '2026-01-01', '{}')"""),
                {"id": str(event_id)},
            )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        rows = connection.execute(sa.text("SELECT request_id FROM audit_events ORDER BY id")).scalars().all()
        assert len(rows) == 2
        assert len({UUID(str(value)) for value in rows}) == 2
        columns = {item["name"]: item for item in sa.inspect(connection).get_columns("audit_events")}
        assert columns["request_id"]["nullable"] is False
        assert "ix_audit_events_request_id" in {
            item["name"] for item in sa.inspect(connection).get_indexes("audit_events")
        }
        with pytest.raises(sa.exc.IntegrityError):
            connection.execute(sa.text("""INSERT INTO audit_events
                (id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, timestamp, metadata)
                VALUES ('event-three', 'tenant', 'human', 'user', 'test', 'entity', 'entity', '2026-01-01', '{}')"""))

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert "request_id" not in {item["name"] for item in sa.inspect(connection).get_columns("audit_events")}


def test_0011_is_safe_when_clean_schema_already_has_request_id() -> None:
    migration = _migration()
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        _legacy_audit_table(connection)
        connection.execute(sa.text("ALTER TABLE audit_events ADD COLUMN request_id CHAR(32) NOT NULL DEFAULT '00000000000000000000000000000000'"))
        connection.execute(sa.text("CREATE INDEX ix_audit_events_request_id ON audit_events (request_id)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()


def test_empty_database_upgrades_cleanly_to_head(tmp_path, monkeypatch) -> None:
    database_path = tmp_path / "fresh.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))

    command.upgrade(config, "head")

    engine = sa.create_engine(f"sqlite:///{database_path}")
    with engine.connect() as connection:
        columns = {item["name"]: item for item in sa.inspect(connection).get_columns("audit_events")}
        assert columns["request_id"]["nullable"] is False
