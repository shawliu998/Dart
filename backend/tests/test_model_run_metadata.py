"""Persistence contract for safe, append-only model-run provenance."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.entities import ModelRun


SAFE_METADATA_KEYS = {
    "provider_version",
    "request_id",
    "source_kind",
    "source_page_count",
}
SENSITIVE_BODY_KEYS = {
    "prompt",
    "system_prompt",
    "user_input",
    "input",
    "output",
    "raw_output",
    "source_text",
    "excerpt",
}


def _model_run(**overrides: object) -> ModelRun:
    values: dict[str, object] = {
        "id": uuid4(),
        "tenant_id": uuid4(),
        "project_id": uuid4(),
        "task_type": "requirement_extraction",
        "provider": "mock",
        "model": "mock-requirements-v1",
        "prompt_version": "requirements-v1",
        "input_hash": "a" * 64,
        "output_hash": "b" * 64,
        "status": "completed",
    }
    values.update(overrides)
    return ModelRun(**values)


def test_model_run_provenance_columns_are_additive() -> None:
    engine = create_engine("sqlite:///:memory:")
    try:
        Base.metadata.create_all(engine)
        columns = {column["name"] for column in inspect(engine).get_columns("model_runs")}
        assert {
            "output_schema",
            "source_document_id",
            "source_page",
            "error_code",
            "metadata",
        } <= columns
    finally:
        engine.dispose()


def test_model_run_provenance_defaults_and_safe_metadata_round_trip() -> None:
    engine = create_engine("sqlite:///:memory:")
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            run = _model_run()
            session.add(run)
            session.flush()

            assert run.output_schema is None
            assert run.source_document_id is None
            assert run.source_page is None
            assert run.error_code is None
            assert run.metadata_json == {}
            assert run.created_at is not None

            safe_metadata = {
                "provider_version": "offline-v1",
                "request_id": "run-001",
                "source_kind": "document_page",
                "source_page_count": 1,
            }
            assert set(safe_metadata) <= SAFE_METADATA_KEYS
            assert not (set(safe_metadata) & SENSITIVE_BODY_KEYS)

            run.output_schema = "RequirementBatch"
            run.source_document_id = uuid4()
            run.source_page = 3
            run.error_code = "provider_timeout"
            run.metadata_json = safe_metadata
            session.commit()

            persisted = session.get(ModelRun, run.id)
            assert persisted is not None
            assert persisted.output_schema == "RequirementBatch"
            assert persisted.source_document_id == run.source_document_id
            assert persisted.source_page == 3
            assert persisted.error_code == "provider_timeout"
            assert persisted.metadata_json == safe_metadata
            assert not (set(persisted.metadata_json) & SENSITIVE_BODY_KEYS)
    finally:
        engine.dispose()
