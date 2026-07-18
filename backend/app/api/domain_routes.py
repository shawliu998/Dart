from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.serializers import model_dict
from app.audit.service import append_event
from app.auth.dependencies import Principal, get_principal, require_review, require_write
from app.core.config import get_settings
from app.db.session import get_db
from app.models.entities import (
    Amendment,
    AmendmentChange,
    AmendmentImpact,
    AuditEvent,
    ComplianceCheck,
    EvidenceClaim,
    EvidenceAsset,
    EvidenceMatch,
    RemediationTask,
    Requirement,
    ResponseEvidenceLink,
    ResponseItem,
    SubmissionPackage,
)
from app.schemas.domain import (
    AmendmentAnalyze,
    ComplianceOverride,
    ConsistencyResolve,
    EvidenceClaimRead,
    EvidenceCreate,
    EvidenceRead,
    EvidenceUpdate,
    MatchDecision,
    PackageBuild,
    PackageItemUpdate,
    ResponseEdit,
    ResponseItemRead,
    TaskCreate,
    TaskDecision,
    TaskUpdate,
)
from app.services import evidence as evidence_service
from app.services import packaging as package_service
from app.services import responses as response_service
from app.services import review_workflows as workflow
from app.services.projects import get_project
from app.storage.local import resolve_storage
from app.storage.adapter import get_storage_adapter

router = APIRouter(prefix="/api")


def _response_read(db: Session, item: ResponseItem) -> dict:
    """Serialize source links without exposing claims from another tenant."""
    return {
        **model_dict(item),
        "evidence_claim_ids": list(
            db.scalars(
                select(ResponseEvidenceLink.evidence_claim_id).where(
                    ResponseEvidenceLink.response_item_id == item.id,
                    ResponseEvidenceLink.tenant_id == item.tenant_id,
                )
            )
        ),
    }


def _get_response_item(db: Session, principal: Principal, response_id: UUID) -> ResponseItem:
    item = db.scalar(
        select(ResponseItem).where(
            ResponseItem.id == response_id,
            ResponseItem.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="response item not found")
    get_project(db, principal, item.project_id)
    return item


@router.post("/evidence", response_model=EvidenceRead, status_code=201)
def create_evidence(
    data: EvidenceCreate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    return evidence_service.create_asset(db, principal, data)


@router.get("/evidence", response_model=list[EvidenceRead])
def list_evidence(db: Session = Depends(get_db), principal: Principal = Depends(get_principal)):
    return evidence_service.list_assets(db, principal)


@router.get("/evidence/{evidence_id}")
def evidence_detail(
    evidence_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    asset = evidence_service.get_asset(db, principal, evidence_id)
    claims = list(
        db.scalars(select(EvidenceClaim).where(EvidenceClaim.evidence_asset_id == asset.id))
    )
    return {"asset": model_dict(asset), "claims": [model_dict(claim) for claim in claims]}


@router.patch("/evidence/{evidence_id}", response_model=EvidenceRead)
def patch_evidence(
    evidence_id: UUID,
    data: EvidenceUpdate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return evidence_service.update_asset(
        db, principal, evidence_service.get_asset(db, principal, evidence_id), data
    )


@router.post("/evidence/{evidence_id}/extract-claims", response_model=list[EvidenceClaimRead])
def extract_claims(
    evidence_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    require_write(principal)
    return evidence_service.extract_claims(
        db, principal, evidence_service.get_asset(db, principal, evidence_id)
    )


@router.post("/projects/{project_id}/evidence/match")
def match_evidence(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    require_write(principal)
    get_project(db, principal, project_id)
    return [
        model_dict(item) for item in evidence_service.suggest_matches(db, principal, project_id)
    ]


@router.get("/projects/{project_id}/evidence-matches")
def list_evidence_matches(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    get_project(db, principal, project_id)
    matches = list(
        db.scalars(
            select(EvidenceMatch)
            .join(Requirement, Requirement.id == EvidenceMatch.requirement_id)
            .where(
                EvidenceMatch.tenant_id == principal.tenant_id,
                Requirement.project_id == project_id,
                Requirement.is_current.is_(True),
            )
        )
    )
    result = []
    for match in matches:
        requirement = db.get(Requirement, match.requirement_id)
        claim = db.get(EvidenceClaim, match.evidence_claim_id)
        asset = db.get(EvidenceAsset, claim.evidence_asset_id) if claim else None
        result.append(
            {
                "match": model_dict(match),
                "requirement": model_dict(requirement) if requirement else None,
                "claim": model_dict(claim) if claim else None,
                "asset": model_dict(asset) if asset else None,
            }
        )
    return result


@router.post("/evidence-matches/{match_id}/accept")
def accept_match(
    match_id: UUID,
    data: MatchDecision,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return model_dict(evidence_service.decide_match(db, principal, match_id, True, data.reason))


@router.post("/evidence-matches/{match_id}/reject")
def reject_match(
    match_id: UUID,
    data: MatchDecision,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return model_dict(evidence_service.decide_match(db, principal, match_id, False, data.reason))


@router.get("/projects/{project_id}/responses", response_model=list[ResponseItemRead])
def list_responses(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    get_project(db, principal, project_id)
    items = list(
        db.scalars(
            select(ResponseItem)
            .join(Requirement, Requirement.id == ResponseItem.requirement_id)
            .where(
                ResponseItem.project_id == project_id,
                ResponseItem.tenant_id == principal.tenant_id,
                Requirement.is_current.is_(True),
            )
            .order_by(ResponseItem.created_at)
        )
    )
    return [_response_read(db, item) for item in items]


@router.patch("/responses/{response_id}", response_model=ResponseItemRead)
def edit_response(
    response_id: UUID,
    data: ResponseEdit,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    item = _get_response_item(db, principal, response_id)
    before = {"edited_text": item.edited_text, "status": item.status}
    item.edited_text = data.edited_text
    item.status = "needs_review"
    item.reviewed_by = None
    item.reviewed_at = None
    item.version += 1
    append_event(
        db,
        principal,
        action="response.edited",
        entity_type="response_item",
        entity_id=item.id,
        project_id=item.project_id,
        before=before,
        after={"edited_text": item.edited_text, "status": item.status, "reason": data.reason},
    )
    db.commit()
    db.refresh(item)
    return _response_read(db, item)


@router.post("/responses/{response_id}/approve", response_model=ResponseItemRead)
def approve_response(
    response_id: UUID,
    data: MatchDecision,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    item = _get_response_item(db, principal, response_id)
    if item.status not in {"drafted", "needs_review"}:
        raise HTTPException(status_code=409, detail="response item is not ready for approval")
    return _response_read(db, response_service.approve_response(db, principal, item, data.reason))


@router.post("/projects/{project_id}/compliance/run")
def run_compliance(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    require_write(principal)
    get_project(db, principal, project_id)
    return [model_dict(item) for item in workflow.run_compliance(db, principal, project_id)]


@router.get("/projects/{project_id}/compliance")
def list_compliance(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    get_project(db, principal, project_id)
    return [
        model_dict(item)
        for item in db.scalars(
            select(ComplianceCheck)
            .join(Requirement, Requirement.id == ComplianceCheck.requirement_id, isouter=True)
            .where(
                ComplianceCheck.project_id == project_id,
                ComplianceCheck.tenant_id == principal.tenant_id,
                (ComplianceCheck.requirement_id.is_(None) | Requirement.is_current.is_(True)),
            )
        )
    ]


@router.post("/compliance-checks/{check_id}/override")
def override_compliance(
    check_id: UUID,
    data: ComplianceOverride,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return model_dict(workflow.override_compliance(db, principal, check_id, data))


@router.post("/projects/{project_id}/consistency/run")
def run_consistency(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    require_write(principal)
    get_project(db, principal, project_id)
    return [model_dict(item) for item in workflow.run_consistency(db, principal, project_id)]


@router.get("/projects/{project_id}/consistency")
def list_consistency(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    get_project(db, principal, project_id)
    return [model_dict(item) for item in workflow.list_consistency(db, principal, project_id)]


@router.post("/consistency-issues/{issue_id}/resolve")
def resolve_consistency(
    issue_id: UUID,
    data: ConsistencyResolve,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return model_dict(workflow.resolve_consistency(db, principal, issue_id, data))


@router.post("/projects/{project_id}/amendments/analyze")
def analyze_amendment(
    project_id: UUID,
    data: AmendmentAnalyze,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    get_project(db, principal, project_id)
    return model_dict(workflow.analyze_amendment(db, principal, project_id, data.document_id))


@router.get("/projects/{project_id}/amendments")
def list_amendments(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    get_project(db, principal, project_id)
    return [
        model_dict(item)
        for item in db.scalars(
            select(Amendment).where(
                Amendment.project_id == project_id, Amendment.tenant_id == principal.tenant_id
            )
        )
    ]


@router.get("/amendments/{amendment_id}/changes")
def amendment_changes(
    amendment_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    amendment = db.scalar(
        select(Amendment).where(
            Amendment.id == amendment_id, Amendment.tenant_id == principal.tenant_id
        )
    )
    if amendment is None:
        raise HTTPException(status_code=404, detail="amendment not found")
    changes = list(
        db.scalars(select(AmendmentChange).where(AmendmentChange.amendment_id == amendment_id))
    )
    return [
        {
            **model_dict(change),
            "impacts": [
                model_dict(impact)
                for impact in db.scalars(
                    select(AmendmentImpact).where(AmendmentImpact.amendment_change_id == change.id)
                )
            ],
        }
        for change in changes
    ]


@router.post("/amendments/{amendment_id}/apply")
def apply_amendment(
    amendment_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    require_review(principal)
    return model_dict(workflow.apply_amendment(db, principal, amendment_id))


@router.post("/projects/{project_id}/tasks", status_code=201)
def create_task(
    project_id: UUID,
    data: TaskCreate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    get_project(db, principal, project_id)
    return model_dict(workflow.create_task(db, principal, project_id, data))


@router.get("/projects/{project_id}/tasks")
def list_tasks(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    get_project(db, principal, project_id)
    return [
        model_dict(item)
        for item in db.scalars(
            select(RemediationTask).where(
                RemediationTask.project_id == project_id,
                RemediationTask.tenant_id == principal.tenant_id,
            )
        )
    ]


@router.patch("/tasks/{task_id}")
def patch_task(
    task_id: UUID,
    data: TaskUpdate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    return model_dict(
        workflow.update_task(db, principal, workflow.get_task(db, principal, task_id), data)
    )


@router.post("/tasks/{task_id}/complete")
def complete_task(
    task_id: UUID,
    data: TaskDecision,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    return model_dict(
        workflow.decide_task(
            db, principal, workflow.get_task(db, principal, task_id), "complete", data.note
        )
    )


@router.post("/tasks/{task_id}/review")
def review_task(
    task_id: UUID,
    data: TaskDecision,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return model_dict(
        workflow.decide_task(
            db, principal, workflow.get_task(db, principal, task_id), "review", data.note
        )
    )


@router.get("/projects/{project_id}/package")
def package_overview(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    get_project(db, principal, project_id)
    items = package_service.ensure_blueprint(db, principal, project_id)
    packages = list(
        db.scalars(
            select(SubmissionPackage).where(
                SubmissionPackage.project_id == project_id,
                SubmissionPackage.tenant_id == principal.tenant_id,
            )
        )
    )
    return {
        "items": [model_dict(item) for item in items],
        "packages": [model_dict(item) for item in packages],
        "external_submission_supported": False,
    }


@router.post("/projects/{project_id}/package/validate")
def validate_package(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    require_write(principal)
    get_project(db, principal, project_id)
    return [
        model_dict(item) for item in package_service.validate_package(db, principal, project_id)
    ]


@router.post("/projects/{project_id}/package/preview")
def preview_package(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    require_write(principal)
    get_project(db, principal, project_id)
    return model_dict(
        package_service.build_package(
            db, principal, project_id, approved=False, approval_reason=None, preview=True
        )
    )


@router.post("/projects/{project_id}/package/build")
def build_package(
    project_id: UUID,
    data: PackageBuild,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    get_project(db, principal, project_id)
    return model_dict(
        package_service.build_package(
            db, principal, project_id, approved=data.approved, approval_reason=data.approval_reason
        )
    )


@router.patch("/package-items/{item_id}")
def patch_package_item(
    item_id: UUID,
    data: PackageItemUpdate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_review(principal)
    return model_dict(package_service.update_package_item(db, principal, item_id, data))


@router.get("/submission-packages/{package_id}/download")
def download_package(
    package_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    package = package_service.get_submission_package(db, principal, package_id)
    append_event(
        db,
        principal,
        action="package.downloaded",
        entity_type="submission_package",
        entity_id=package.id,
        project_id=package.project_id,
        after={"sha256": package.sha256},
    )
    db.commit()
    signed_url = get_storage_adapter().signed_url(package.storage_key, 300)
    if signed_url:
        return RedirectResponse(signed_url, status_code=307)
    path = resolve_storage(get_settings().upload_dir, package.storage_key)
    return FileResponse(
        path, media_type="application/zip", filename=f"BidEvidence_v{package.package_version}.zip"
    )


@router.get("/projects/{project_id}/audit/export")
def export_audit(
    project_id: UUID, db: Session = Depends(get_db), principal: Principal = Depends(get_principal)
):
    get_project(db, principal, project_id)
    events = list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.project_id == project_id, AuditEvent.tenant_id == principal.tenant_id)
            .order_by(AuditEvent.timestamp)
        )
    )
    payload = json.dumps(
        [model_dict(event) for event in events], ensure_ascii=False, default=str, indent=2
    )
    append_event(
        db,
        principal,
        action="audit.exported",
        entity_type="project",
        entity_id=project_id,
        project_id=project_id,
        after={"count": len(events)},
    )
    db.commit()
    return Response(
        payload,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="audit-{project_id}.json"'},
    )
