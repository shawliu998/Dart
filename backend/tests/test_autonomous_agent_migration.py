from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_0006_preserves_legacy_supervised_runs_and_defaults_new_runs_to_autonomous() -> None:
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0006_autonomous_draft_agent.py"
    )
    spec = importlib.util.spec_from_file_location(
        "migration_0006_autonomous_draft_agent", migration_path
    )
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite://")

    with engine.begin() as connection:
        connection.execute(
            sa.text("CREATE TABLE agent_runs (id VARCHAR(36) PRIMARY KEY)")
        )
        connection.execute(sa.text("INSERT INTO agent_runs (id) VALUES ('legacy')"))
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            migration.upgrade()

        legacy_mode = connection.scalar(
            sa.text("SELECT mode FROM agent_runs WHERE id = 'legacy'")
        )
        assert legacy_mode == "supervised"

        connection.execute(sa.text("INSERT INTO agent_runs (id) VALUES ('new')"))
        new_mode = connection.scalar(
            sa.text("SELECT mode FROM agent_runs WHERE id = 'new'")
        )
        assert new_mode == "autonomous_draft"
