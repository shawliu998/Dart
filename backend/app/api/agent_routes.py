from __future__ import annotations

from uuid import UUID

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.serializers import model_dict
from app.auth.dependencies import Principal, get_principal, require_review, require_write
from app.db.session import get_db
from app.models.entities import AgentArtifact, AgentEvent, AgentRun
from app.core.config import get_settings
from app.storage.local import resolve_storage
from app.schemas.agent_runtime import AgentRunCreate, ApprovalDecision
from app.services import agent_runtime
from app.services.jobs import process_next_job

router = APIRouter(prefix="/api")


def serialize_bundle(bundle: dict) -> dict:
    return {key: [model_dict(item) for item in value] if isinstance(value, list) else model_dict(value) for key, value in bundle.items()}


@router.post("/projects/{project_id}/agent-runs", status_code=201)
def create_agent_run(project_id: UUID, data: AgentRunCreate, background: BackgroundTasks, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> dict:
    require_write(principal)
    bundle = agent_runtime.create_run(
        db,
        principal,
        project_id,
        goal=data.goal,
        input_revision=data.input_revision,
        mode=data.mode,
        max_iterations=data.max_iterations,
    )
    background.add_task(process_next_job)
    return serialize_bundle(bundle)


@router.get("/projects/{project_id}/agent-runs")
def list_agent_runs(project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> list[dict]:
    return [serialize_bundle(item) for item in agent_runtime.list_runs(db, principal, project_id)]


@router.get("/agent-runs/{run_id}")
def get_agent_run(run_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> dict:
    try:
        return serialize_bundle(agent_runtime.get_run(db, principal, run_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/agent-runs/{run_id}/events")
def get_agent_events(run_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> list[dict]:
    agent_runtime.get_run(db, principal, run_id)
    return [model_dict(item) for item in db.scalars(select(AgentEvent).where(AgentEvent.run_id == run_id, AgentEvent.tenant_id == principal.tenant_id).order_by(AgentEvent.sequence))]


@router.get("/agent-artifacts/{artifact_id}/download")
def download_agent_artifact(artifact_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> FileResponse:
    artifact = db.scalar(
        select(AgentArtifact)
        .join(AgentRun, AgentRun.id == AgentArtifact.run_id)
        .where(AgentArtifact.id == artifact_id, AgentArtifact.tenant_id == principal.tenant_id)
    )
    if artifact is None:
        raise HTTPException(status_code=404, detail="agent artifact not found")
    settings = get_settings()
    root = settings.app_data_dir or Path(__file__).resolve().parents[2] / "data"
    try:
        path = resolve_storage(root, artifact.storage_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid artifact storage") from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="artifact file not found")
    return FileResponse(path, filename=artifact.metadata_json.get("download_name", artifact.title))


@router.post("/agent-runs/{run_id}/cancel")
def cancel_agent_run(run_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> dict:
    require_write(principal)
    return serialize_bundle(agent_runtime.cancel_run(db, principal, run_id))


@router.post("/agent-runs/{run_id}/retry")
def retry_agent_run(run_id: UUID, background: BackgroundTasks, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> dict:
    require_write(principal)
    try:
        bundle = agent_runtime.retry_run(db, principal, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    background.add_task(process_next_job)
    return serialize_bundle(bundle)


def decide(approval_id: UUID, data: ApprovalDecision, approved: bool, background: BackgroundTasks, db: Session, principal: Principal) -> dict:
    require_review(principal)
    try:
        bundle = agent_runtime.decide_approval(db, principal, approval_id, approved=approved, reason=data.reason)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if approved and bundle["run"].status == "queued":
        background.add_task(process_next_job)
    return serialize_bundle(bundle)


@router.post("/approvals/{approval_id}/approve")
def approve(approval_id: UUID, data: ApprovalDecision, background: BackgroundTasks, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> dict:
    return decide(approval_id, data, True, background, db, principal)


@router.post("/approvals/{approval_id}/reject")
def reject(approval_id: UUID, data: ApprovalDecision, background: BackgroundTasks, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)) -> dict:
    return decide(approval_id, data, False, background, db, principal)
