"""Focused tests for P1 agent runtime persistence.

Covers metadata schema creation on SQLite, ORM defaults, foreign keys and
unique constraints, Pydantic v2 mappings and status validation, and the
0003_agent_runtime migration (upgrade/downgrade + revision linkage).
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.entities import (
    AgentArtifact,
    AgentEvent,
    AgentRun,
    AgentStepRun,
    ApprovalRequest,
    AsyncJob,
    TenderProject,
)
from app.schemas.agent_runtime import (
    DEFAULT_WORKFLOW_TYPE,
    AgentArtifactRead,
    AgentEventRead,
    AgentRunCreate,
    AgentRunRead,
    AgentStepRunRead,
    ApprovalDecision,
    ApprovalRequestRead,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = BACKEND_ROOT / "alembic" / "versions" / "0003_agent_runtime.py"

AGENT_TABLES = {
    "agent_runs",
    "agent_step_runs",
    "agent_events",
    "approval_requests",
    "agent_artifacts",
}
NEW_JOB_COLUMNS = {
    "lease_owner",
    "lease_expires_at",
    "heartbeat_at",
    "attempt_count",
    "max_attempts",
    "cancel_requested",
    "input_revision",
    "result_hash",
    "next_retry_at",
}


@pytest.fixture
def engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine):
    with Session(engine) as session:
        yield session


def _make_project(session: Session, tenant_id: UUID, user_id: UUID) -> TenderProject:
    project = TenderProject(
        tenant_id=tenant_id,
        created_by=user_id,
        organization_id=uuid4(),
        name="智慧城市建设项目",
        project_code="PRJ-0001",
        buyer_name="市采购中心",
    )
    session.add(project)
    session.flush()
    return project


def _make_run(
    session: Session, tenant_id: UUID, user_id: UUID, project: TenderProject
) -> AgentRun:
    run = AgentRun(
        tenant_id=tenant_id,
        created_by=user_id,
        project_id=project.id,
        workflow_type=DEFAULT_WORKFLOW_TYPE,
        goal="分析招标文件并生成投标响应",
    )
    session.add(run)
    session.flush()
    return run


def _make_step(session: Session, run: AgentRun, tenant_id: UUID, user_id: UUID) -> AgentStepRun:
    step = AgentStepRun(
        tenant_id=tenant_id,
        created_by=user_id,
        run_id=run.id,
        step_key="ingest_documents",
        sequence=1,
    )
    session.add(step)
    session.flush()
    return step


# --- metadata / schema creation -------------------------------------------------


def test_metadata_creates_agent_tables_on_sqlite(engine) -> None:
    inspector = inspect(engine)
    assert AGENT_TABLES <= set(inspector.get_table_names())

    step_uniques = {u["name"] for u in inspector.get_unique_constraints("agent_step_runs")}
    assert "uq_agent_step_runs_run_sequence" in step_uniques
    event_uniques = {u["name"] for u in inspector.get_unique_constraints("agent_events")}
    assert "uq_agent_events_run_sequence" in event_uniques

    run_indexes = {i["name"] for i in inspector.get_indexes("agent_runs")}
    assert {
        "ix_agent_runs_project_id",
        "ix_agent_runs_tenant_project",
        "uq_agent_runs_active_project",
    } <= run_indexes
    step_indexes = {i["name"] for i in inspector.get_indexes("agent_step_runs")}
    assert "ix_agent_step_runs_run_id" in step_indexes
    event_indexes = {i["name"] for i in inspector.get_indexes("agent_events")}
    assert "ix_agent_events_run_id" in event_indexes
    artifact_indexes = {i["name"] for i in inspector.get_indexes("agent_artifacts")}
    assert {"ix_agent_artifacts_run_id", "ix_agent_artifacts_tenant_run"} <= artifact_indexes

    # AgentEvent is append-only: no update-side audit columns.
    event_columns = {c["name"] for c in inspector.get_columns("agent_events")}
    assert "updated_at" not in event_columns
    assert "created_by" not in event_columns
    assert "version" not in event_columns

    # Artifact JSON document is stored in a column literally named "metadata".
    artifact_columns = {c["name"] for c in inspector.get_columns("agent_artifacts")}
    assert "metadata" in artifact_columns

    step_fks = inspect(engine).get_foreign_keys("agent_step_runs")
    assert any(
        fk["referred_table"] == "agent_runs" and fk["constrained_columns"] == ["run_id"]
        for fk in step_fks
    )
    run_fks = inspector.get_foreign_keys("agent_runs")
    assert any(
        fk["referred_table"] == "tender_projects"
        and fk["constrained_columns"] == ["project_id"]
        for fk in run_fks
    )
    for table in ("agent_events", "approval_requests", "agent_artifacts"):
        fks = inspector.get_foreign_keys(table)
        referred = {(fk["referred_table"], tuple(fk["constrained_columns"])) for fk in fks}
        assert ("agent_runs", ("run_id",)) in referred
        assert ("agent_step_runs", ("step_run_id",)) in referred


# --- ORM defaults / constraints --------------------------------------------------


def test_agent_run_defaults(session) -> None:
    tenant_id, user_id = uuid4(), uuid4()
    project = _make_project(session, tenant_id, user_id)
    run = _make_run(session, tenant_id, user_id, project)

    assert isinstance(run.id, UUID)
    assert run.status == "queued"
    assert run.mode == "autonomous_draft"
    assert run.scope == "full_bid_draft"
    assert run.outcome is None
    assert run.plan_json == {}
    assert run.iteration == 0 and run.max_iterations == 20
    assert run.current_action is None and run.next_action is None
    assert run.input_revision == 1
    assert run.cancel_requested is False
    assert run.current_step is None
    assert run.started_at is None and run.completed_at is None
    assert run.error_code is None and run.error_message is None
    assert run.version == 1
    assert run.created_at is not None and run.updated_at is not None


def test_agent_step_run_defaults_and_unique_sequence(session) -> None:
    tenant_id, user_id = uuid4(), uuid4()
    project = _make_project(session, tenant_id, user_id)
    run = _make_run(session, tenant_id, user_id, project)
    step = _make_step(session, run, tenant_id, user_id)

    assert step.status == "pending"
    assert step.attempt == 1
    assert step.input_hash is None and step.output_hash is None

    duplicate = AgentStepRun(
        tenant_id=tenant_id,
        created_by=user_id,
        run_id=run.id,
        step_key="ingest_documents_retry",
        sequence=1,
    )
    session.add(duplicate)
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_agent_event_append_only_and_unique_sequence(session) -> None:
    tenant_id, user_id = uuid4(), uuid4()
    project = _make_project(session, tenant_id, user_id)
    run = _make_run(session, tenant_id, user_id, project)

    event = AgentEvent(
        tenant_id=tenant_id,
        run_id=run.id,
        event_type="run_created",
        sequence=1,
        payload={"goal": run.goal},
    )
    session.add(event)
    session.flush()
    assert isinstance(event.id, UUID)
    assert event.created_at is not None
    assert event.payload == {"goal": run.goal}
    assert event.step_run_id is None

    duplicate = AgentEvent(
        tenant_id=tenant_id,
        run_id=run.id,
        event_type="run_created_again",
        sequence=1,
    )
    session.add(duplicate)
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_foreign_keys_enforced_when_sqlite_pragma_enabled() -> None:
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            orphan_step = AgentStepRun(
                tenant_id=uuid4(),
                created_by=uuid4(),
                run_id=uuid4(),
                step_key="ingest_documents",
                sequence=1,
            )
            session.add(orphan_step)
            with pytest.raises(IntegrityError):
                session.flush()
    finally:
        engine.dispose()


def test_async_job_durable_queue_defaults(session) -> None:
    job = AsyncJob(
        tenant_id=uuid4(),
        created_by=uuid4(),
        job_type="agent_run",
        entity_id=uuid4(),
    )
    session.add(job)
    session.flush()

    # Pre-existing behavior kept intact.
    assert job.status == "queued"
    assert job.progress == 0
    assert job.retryable is True
    # New durable queue columns.
    assert job.lease_owner is None
    assert job.lease_expires_at is None
    assert job.heartbeat_at is None
    assert job.attempt_count == 0
    assert job.max_attempts == 3
    assert job.cancel_requested is False
    assert job.input_revision == 1
    assert job.result_hash is None
    assert job.next_retry_at is None


def test_approval_and_artifact_roundtrip(session) -> None:
    tenant_id, user_id = uuid4(), uuid4()
    project = _make_project(session, tenant_id, user_id)
    run = _make_run(session, tenant_id, user_id, project)
    step = _make_step(session, run, tenant_id, user_id)

    approval = ApprovalRequest(
        tenant_id=tenant_id,
        created_by=user_id,
        run_id=run.id,
        step_run_id=step.id,
        approval_type="submission",
        title="提交前审批",
        description="提交前必须经人工审批。",
        impact_summary="审批决定影响投标文件是否可交付。",
        requested_role="admin",
    )
    artifact = AgentArtifact(
        tenant_id=tenant_id,
        created_by=user_id,
        run_id=run.id,
        step_run_id=step.id,
        artifact_type="draft_response",
        title="投标响应草案",
        storage_key="artifacts/draft.md",
        content_hash="a" * 64,
        metadata_json={"pages": 3},
    )
    session.add_all([approval, artifact])
    session.flush()

    assert approval.status == "pending"
    assert approval.reversible is True
    assert approval.description == "提交前必须经人工审批。"
    assert approval.decision_reason is None and approval.decided_at is None
    assert artifact.metadata_json == {"pages": 3}
    # SQL column behind the attribute is literally "metadata".
    assert AgentArtifact.__table__.c["metadata"].name == "metadata"


# --- Pydantic mappings / validation ----------------------------------------------


def test_pydantic_reads_from_orm(session) -> None:
    tenant_id, user_id = uuid4(), uuid4()
    project = _make_project(session, tenant_id, user_id)
    run = _make_run(session, tenant_id, user_id, project)
    step = _make_step(session, run, tenant_id, user_id)
    agent_event = AgentEvent(
        tenant_id=tenant_id,
        run_id=run.id,
        step_run_id=step.id,
        event_type="step_started",
        sequence=1,
        payload={"step_key": step.step_key},
    )
    approval = ApprovalRequest(
        tenant_id=tenant_id,
        created_by=user_id,
        run_id=run.id,
        step_run_id=step.id,
        approval_type="submission",
        title="提交前审批",
        description="提交前必须经人工审批。",
        impact_summary="审批决定影响投标文件是否可交付。",
        requested_role="admin",
    )
    artifact = AgentArtifact(
        tenant_id=tenant_id,
        created_by=user_id,
        run_id=run.id,
        step_run_id=step.id,
        artifact_type="draft_response",
        title="投标响应草案",
        storage_key="artifacts/draft.md",
        content_hash="b" * 64,
        metadata_json={"pages": 3},
    )
    session.add_all([agent_event, approval, artifact])
    session.flush()

    run_read = AgentRunRead.model_validate(run)
    assert run_read.status == "queued"
    assert run_read.project_id == project.id
    assert run_read.version == 1

    step_read = AgentStepRunRead.model_validate(step)
    assert step_read.status == "pending"
    assert step_read.sequence == 1
    assert step_read.attempt == 1

    event_read = AgentEventRead.model_validate(agent_event)
    assert event_read.payload == {"step_key": step.step_key}
    assert event_read.step_run_id == step.id

    approval_read = ApprovalRequestRead.model_validate(approval)
    assert approval_read.status == "pending"
    assert approval_read.reversible is True

    artifact_read = AgentArtifactRead.model_validate(artifact)
    assert artifact_read.metadata == {"pages": 3}
    dumped = artifact_read.model_dump()
    assert dumped["metadata"] == {"pages": 3}
    assert "metadata_json" not in dumped


def test_agent_run_create_defaults() -> None:
    request = AgentRunCreate(project_id=uuid4(), goal="分析招标文件并生成投标响应")
    assert request.workflow_type == "bid_analysis_and_response_v1"
    assert request.workflow_type == DEFAULT_WORKFLOW_TYPE
    assert request.input_revision == 1
    assert request.mode == "autonomous_draft"
    assert request.scope == "full_bid_draft"
    assert request.max_iterations == 20


def test_approval_decision_validation() -> None:
    decision = ApprovalDecision(reason="人工确认无误")
    assert decision.reason == "人工确认无误"

    with pytest.raises(ValidationError):
        ApprovalDecision(reason="x")
    with pytest.raises(ValidationError):
        ApprovalDecision(reason="")


def test_read_schemas_reject_unknown_status(session) -> None:
    tenant_id, user_id = uuid4(), uuid4()
    project = _make_project(session, tenant_id, user_id)
    run = _make_run(session, tenant_id, user_id, project)
    step = _make_step(session, run, tenant_id, user_id)

    run_data = AgentRunRead.model_validate(run).model_dump()
    run_data["status"] = "exploded"
    with pytest.raises(ValidationError):
        AgentRunRead.model_validate(run_data)

    step_data = AgentStepRunRead.model_validate(step).model_dump()
    step_data["status"] = "exploded"
    with pytest.raises(ValidationError):
        AgentStepRunRead.model_validate(step_data)


# --- migration -------------------------------------------------------------------


def test_migration_revision_linkage() -> None:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    script = ScriptDirectory.from_config(config)
    revisions = {rev.revision: rev for rev in script.walk_revisions()}

    assert revisions["0002_phase2_to_5"].down_revision == "0001_phase01"
    assert revisions["0003_agent_runtime"].down_revision == "0002_phase2_to_5"
    assert revisions["0004_model_run_provenance"].down_revision == "0003_agent_runtime"
    assert revisions["0005_response_workbench"].down_revision == "0004_model_run_provenance"
    assert revisions["0006_autonomous_draft_agent"].down_revision == "0005_response_workbench"
    assert revisions["0007_unique_active_agent_job"].down_revision == "0006_autonomous_draft_agent"
    assert revisions["0008_agent_run_scope_outcome"].down_revision == "0007_unique_active_agent_job"
    assert tuple(script.get_heads()) == ("0008_agent_run_scope_outcome",)


def _load_migration_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("alembic_0003_agent_runtime", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_migration(engine, direction: str) -> None:
    module = _load_migration_module()
    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            getattr(module, direction)()


def _create_pre_0003_async_jobs(engine) -> None:
    metadata = sa.MetaData()
    sa.Table(
        "async_jobs",
        metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("job_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("current_step", sa.String(length=200), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("retryable", sa.Boolean(), nullable=False),
    )
    metadata.create_all(engine)


def test_migration_upgrade_and_downgrade_on_sqlite() -> None:
    engine = create_engine("sqlite:///:memory:")
    _create_pre_0003_async_jobs(engine)
    try:
        _run_migration(engine, "upgrade")
        # Guarded statements make a second upgrade a safe no-op.
        _run_migration(engine, "upgrade")

        inspector = inspect(engine)
        assert AGENT_TABLES <= set(inspector.get_table_names())
        job_columns = {column["name"] for column in inspector.get_columns("async_jobs")}
        assert NEW_JOB_COLUMNS <= job_columns

        step_uniques = {u["name"] for u in inspector.get_unique_constraints("agent_step_runs")}
        assert "uq_agent_step_run_sequence" in step_uniques
        event_uniques = {u["name"] for u in inspector.get_unique_constraints("agent_events")}
        assert "uq_agent_event_sequence" in event_uniques
        artifact_columns = {c["name"] for c in inspector.get_columns("agent_artifacts")}
        assert "metadata" in artifact_columns
        event_columns = {c["name"] for c in inspector.get_columns("agent_events")}
        assert "updated_at" not in event_columns
        run_indexes = {i["name"] for i in inspector.get_indexes("agent_runs")}
        assert "ix_agent_runs_tenant_project" in run_indexes

        _run_migration(engine, "downgrade")

        inspector = inspect(engine)
        assert AGENT_TABLES.isdisjoint(inspector.get_table_names())
        job_columns = {column["name"] for column in inspector.get_columns("async_jobs")}
        assert NEW_JOB_COLUMNS.isdisjoint(job_columns)
        assert {"job_type", "entity_id", "status", "retryable"} <= job_columns
    finally:
        engine.dispose()
