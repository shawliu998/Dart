from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import Principal, get_principal, require_review, require_write
from app.db.session import get_db
from app.models.entities import (
    AsyncJob,
    AuditEvent,
    DisqualificationRule,
    Document,
    DocumentPage,
    Requirement,
)
from app.schemas.common import DecisionRequest, JobRead
from app.schemas.documents import DocumentRead, PageRead
from app.schemas.projects import ProjectCreate, ProjectRead, ProjectUpdate
from app.schemas.requirements import (
    DisqualificationRead,
    RequirementRead,
    RequirementUpdate,
    RequirementVerify,
)
from app.services import documents as document_service
from app.services import reanalysis as reanalysis_service
from app.services import projects as project_service
from app.services.extraction import detect_for_project
from app.services.jobs import process_next_job
from app.services.review import (
    decide_disqualification,
    decide_requirement,
    get_requirement,
    update_requirement,
)

router = APIRouter(prefix="/api")


@router.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    return project_service.create_project(db, principal, data)


@router.get("/projects", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db), principal: Principal = Depends(get_principal)):
    return project_service.list_projects(db, principal)


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    return project_service.get_project(db, principal, project_id)


@router.patch("/projects/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    return project_service.update_project(
        db, principal, project_service.get_project(db, principal, project_id), data
    )


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    require_write(principal)
    project_service.delete_project(
        db, principal, project_service.get_project(db, principal, project_id)
    )


@router.post("/projects/{project_id}/documents", response_model=DocumentRead, status_code=201)
async def upload_document(
    project_id: UUID,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    project_service.get_project(db, principal, project_id)
    data = await file.read()
    return document_service.ingest_document(
        db,
        principal,
        project_id=project_id,
        filename=file.filename or "unnamed",
        declared_mime=file.content_type or "application/octet-stream",
        document_type=document_type,
        data=data,
    )


@router.get("/projects/{project_id}/documents", response_model=list[DocumentRead])
def list_documents(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    project_service.get_project(db, principal, project_id)
    return list(
        db.scalars(
            select(Document).where(
                Document.project_id == project_id,
                Document.tenant_id == principal.tenant_id,
                Document.deleted_at.is_(None),
            )
        )
    )


@router.get("/documents/{document_id}", response_model=DocumentRead)
def get_document(
    document_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    return document_service.get_document(db, principal, document_id)


@router.post("/documents/{document_id}/parse", response_model=JobRead, status_code=202)
def parse_document(
    document_id: UUID,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    document_service.get_document(db, principal, document_id)
    job = document_service.create_job(
        db, principal, job_type="document_parse", entity_id=document_id
    )
    background.add_task(process_next_job)
    return job


@router.post("/documents/{document_id}/reanalyze", response_model=JobRead, status_code=202)
def reanalyze_document(
    document_id: UUID,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    document = document_service.get_document(db, principal, document_id)
    try:
        job = reanalysis_service.create_reanalysis_job(db, principal, document)
    except reanalysis_service.ReanalysisConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    background.add_task(process_next_job)
    return job


@router.get("/documents/{document_id}/pages/{page_number}", response_model=PageRead)
def get_page(
    document_id: UUID,
    page_number: int,
    revision: int | None = None,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    document = document_service.get_document(db, principal, document_id)
    selected_revision = revision if revision is not None else document.parse_revision
    page = db.scalar(
        select(DocumentPage).where(
            DocumentPage.document_id == document_id,
            DocumentPage.page_number == page_number,
            DocumentPage.tenant_id == principal.tenant_id,
            DocumentPage.parse_revision == selected_revision,
        )
    )
    if page is None:
        raise HTTPException(status_code=404, detail="page not found")
    return page


class ExtractRequest(BaseModel):
    document_id: UUID


@router.post("/projects/{project_id}/requirements/extract", response_model=JobRead, status_code=202)
def extract_requirements(
    project_id: UUID,
    data: ExtractRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    project_service.get_project(db, principal, project_id)
    document = document_service.get_document(db, principal, data.document_id)
    if document.project_id != project_id:
        raise HTTPException(status_code=404, detail="document not in project")
    job = document_service.create_job(
        db, principal, job_type="requirement_extraction", entity_id=document.id
    )
    background.add_task(process_next_job)
    return job


@router.get("/projects/{project_id}/requirements", response_model=list[RequirementRead])
def list_requirements(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    project_service.get_project(db, principal, project_id)
    return list(
        db.scalars(
            select(Requirement)
            .where(
                Requirement.project_id == project_id,
                Requirement.tenant_id == principal.tenant_id,
                Requirement.is_current.is_(True),
            )
            .order_by(Requirement.source_page, Requirement.requirement_code)
        )
    )


@router.get("/requirements/{requirement_id}", response_model=RequirementRead)
def requirement_detail(
    requirement_id: UUID,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    return get_requirement(db, principal, requirement_id)


@router.patch("/requirements/{requirement_id}", response_model=RequirementRead)
def patch_requirement(
    requirement_id: UUID,
    data: RequirementUpdate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return update_requirement(db, principal, get_requirement(db, principal, requirement_id), data)


@router.post("/requirements/{requirement_id}/verify", response_model=RequirementRead)
def verify_requirement(
    requirement_id: UUID,
    data: RequirementVerify,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return decide_requirement(
        db, principal, get_requirement(db, principal, requirement_id), data.decision, data.reason
    )


@router.post("/projects/{project_id}/disqualifications/detect")
def detect_disqualifications(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    require_write(principal)
    project_service.get_project(db, principal, project_id)
    return {"created": detect_for_project(db, principal, project_id)}


@router.get("/projects/{project_id}/disqualifications", response_model=list[DisqualificationRead])
def list_disqualifications(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    project_service.get_project(db, principal, project_id)
    return list(
        db.scalars(
            select(DisqualificationRule)
            .join(Requirement, Requirement.id == DisqualificationRule.requirement_id)
            .where(
                Requirement.project_id == project_id,
                Requirement.is_current.is_(True),
                DisqualificationRule.tenant_id == principal.tenant_id,
            )
        )
    )


@router.post("/disqualifications/{rule_id}/confirm", response_model=DisqualificationRead)
def confirm_disqualification(
    rule_id: UUID,
    data: DecisionRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return decide_disqualification(db, principal, rule_id, True, data.reason)


@router.post("/disqualifications/{rule_id}/reject", response_model=DisqualificationRead)
def reject_disqualification(
    rule_id: UUID,
    data: DecisionRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return decide_disqualification(db, principal, rule_id, False, data.reason)


@router.get("/jobs/{job_id}", response_model=JobRead)
def get_job(
    job_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    job = db.scalar(
        select(AsyncJob).where(AsyncJob.id == job_id, AsyncJob.tenant_id == principal.tenant_id)
    )
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/projects/{project_id}/audit")
def list_audit(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    project_service.get_project(db, principal, project_id)
    events = list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.project_id == project_id, AuditEvent.tenant_id == principal.tenant_id)
            .order_by(AuditEvent.timestamp.desc())
        )
    )
    return [
        {
            "id": str(e.id),
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": str(e.entity_id),
            "timestamp": e.timestamp,
            "before": e.before_json,
            "after": e.after_json,
            "model_name": e.model_name,
            "prompt_version": e.prompt_version,
        }
        for e in events
    ]


@router.get("/audit/{audit_id}")
def audit_detail(
    audit_id: UUID,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    event = db.scalar(
        select(AuditEvent).where(
            AuditEvent.id == audit_id, AuditEvent.tenant_id == principal.tenant_id
        )
    )
    if event is None:
        raise HTTPException(status_code=404, detail="audit event not found")
    return {
        "id": str(event.id),
        "project_id": str(event.project_id) if event.project_id else None,
        "action": event.action,
        "entity_type": event.entity_type,
        "entity_id": str(event.entity_id),
        "timestamp": event.timestamp,
        "before": event.before_json,
        "after": event.after_json,
        "input_hash": event.input_hash,
        "output_hash": event.output_hash,
        "model_name": event.model_name,
        "prompt_version": event.prompt_version,
    }
