"""Build planner observations from the existing domain tables."""

from __future__ import annotations

from typing import cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.autonomous_agent.schemas import AgentContext, AgentScope, ToolName
from app.autonomous_agent.tools import TOOL_REGISTRY
from app.models.entities import (
    AgentArtifact,
    AgentEvent,
    AgentRun,
    ComplianceCheck,
    Document,
    DocumentPage,
    EvidenceAsset,
    EvidenceClaim,
    EvidenceMatch,
    RemediationTask,
    Requirement,
    ResponseItem,
)

_EXPORT_ARTIFACT_TYPES = {
    "compliance_matrix_xlsx",
    "response_draft_docx",
    "risk_tasks_xlsx",
}
_USABLE_MATCH_STATUSES = {"accepted", "provisional_match"}


def _count(db: Session, statement) -> int:
    return int(db.scalar(statement) or 0)


def build_agent_context(db: Session, run: AgentRun) -> AgentContext:
    """Aggregate tenant-scoped facts for one persisted agent run."""
    documents = list(
        db.scalars(
            select(Document).where(
                Document.project_id == run.project_id,
                Document.tenant_id == run.tenant_id,
                Document.deleted_at.is_(None),
            )
        )
    )
    document_ids = [item.id for item in documents]
    pages = (
        list(
            db.scalars(
                select(DocumentPage).where(
                    DocumentPage.tenant_id == run.tenant_id,
                    DocumentPage.document_id.in_(document_ids),
                )
            )
        )
        if document_ids
        else []
    )
    requirements = list(
        db.scalars(
            select(Requirement).where(
                Requirement.project_id == run.project_id,
                Requirement.tenant_id == run.tenant_id,
                Requirement.is_current.is_(True),
            )
        )
    )
    requirement_ids = [item.id for item in requirements]
    matches = (
        list(
            db.scalars(
                select(EvidenceMatch).where(
                    EvidenceMatch.tenant_id == run.tenant_id,
                    EvidenceMatch.requirement_id.in_(requirement_ids),
                )
            )
        )
        if requirement_ids
        else []
    )
    matched_requirement_ids = {
        item.requirement_id for item in matches if item.status in _USABLE_MATCH_STATUSES
    }
    responses = list(
        db.scalars(
            select(ResponseItem)
            .join(Requirement, Requirement.id == ResponseItem.requirement_id)
            .where(
                ResponseItem.project_id == run.project_id,
                ResponseItem.tenant_id == run.tenant_id,
                Requirement.is_current.is_(True),
            )
        )
    )
    quality_artifact = db.scalar(
        select(AgentArtifact)
        .where(
            AgentArtifact.run_id == run.id,
            AgentArtifact.tenant_id == run.tenant_id,
            AgentArtifact.artifact_type == "response_quality_check",
        )
        .order_by(AgentArtifact.created_at.desc())
        .limit(1)
    )
    completed_tools: set[ToolName] = set()
    tool_events = db.scalars(
        select(AgentEvent).where(
            AgentEvent.run_id == run.id,
            AgentEvent.tenant_id == run.tenant_id,
            AgentEvent.event_type == "tool.completed",
        )
    )
    for event in tool_events:
        tool = event.payload.get("tool")
        if isinstance(tool, str) and tool in TOOL_REGISTRY:
            completed_tools.add(tool)  # type: ignore[arg-type]

    asset_filter = (
        EvidenceAsset.organization_id == run.tenant_id,
        EvidenceAsset.tenant_id == run.tenant_id,
        EvidenceAsset.deleted_at.is_(None),
    )
    assets = list(db.scalars(select(EvidenceAsset).where(*asset_filter)))
    asset_ids = [item.id for item in assets]
    claim_asset_ids = (
        list(
            db.scalars(
                select(EvidenceClaim.evidence_asset_id).where(
                    EvidenceClaim.tenant_id == run.tenant_id,
                    EvidenceClaim.evidence_asset_id.in_(asset_ids),
                )
            )
        )
        if asset_ids
        else []
    )
    claimed_asset_ids = set(claim_asset_ids)
    checks = list(
        db.scalars(
            select(ComplianceCheck)
            .join(Requirement, Requirement.id == ComplianceCheck.requirement_id, isouter=True)
            .where(
                ComplianceCheck.project_id == run.project_id,
                ComplianceCheck.tenant_id == run.tenant_id,
                (ComplianceCheck.requirement_id.is_(None) | Requirement.is_current.is_(True)),
            )
        )
    )
    artifacts = list(
        db.scalars(
            select(AgentArtifact).where(
                AgentArtifact.run_id == run.id,
                AgentArtifact.tenant_id == run.tenant_id,
            )
        )
    )
    response_requirement_ids = {item.requirement_id for item in responses}
    return AgentContext(
        tenant_id=run.tenant_id,
        project_id=run.project_id,
        run_id=run.id,
        mode=run.mode,
        scope=cast(AgentScope, run.scope),
        goal=run.goal,
        document_count=len(documents),
        tender_main_count=sum(item.document_type == "tender_main" for item in documents),
        unparsed_document_count=sum(item.parse_status != "completed" for item in documents),
        ocr_required_count=sum(page.layout_json.get("ocr_required") is True for page in pages),
        requirement_count=len(requirements),
        provisional_requirement_count=sum(item.review_status == "provisional" for item in requirements),
        manual_review_requirement_count=sum(not item.human_verified for item in requirements),
        disqualification_candidate_count=sum(item.disqualification_if_failed for item in requirements),
        evidence_asset_count=len(assets),
        evidence_claim_count=len(claim_asset_ids),
        unclaimed_evidence_asset_count=sum(
            item.id not in claimed_asset_ids for item in assets
        ),
        evidence_match_count=len(matches),
        provisional_match_count=sum(item.status == "provisional_match" for item in matches),
        missing_evidence_requirement_count=sum(
            item.id not in matched_requirement_ids for item in requirements
        ),
        compliance_check_count=len(checks),
        compliance_fail_count=sum(item.result == "fail" for item in checks),
        compliance_review_count=sum(item.result == "manual_review" for item in checks),
        response_count=len(responses),
        missing_response_count=sum(item.id not in response_requirement_ids for item in requirements),
        missing_evidence_response_count=sum(item.status == "missing_evidence" for item in responses),
        review_response_count=sum(item.status == "needs_review" for item in responses),
        response_quality_issue_count=int(
            (quality_artifact.metadata_json if quality_artifact else {}).get("issue_count", 0)
        ),
        response_quality_artifact_count=sum(
            item.artifact_type == "response_quality_check" for item in artifacts
        ),
        remediation_task_count=_count(
            db,
            select(func.count()).select_from(RemediationTask).where(
                RemediationTask.project_id == run.project_id,
                RemediationTask.tenant_id == run.tenant_id,
            ),
        ),
        project_profile_artifact_count=sum(
            item.artifact_type == "project_profile" for item in artifacts
        ),
        export_artifact_count=sum(
            item.artifact_type in _EXPORT_ARTIFACT_TYPES for item in artifacts
        ),
        completed_tools=completed_tools,
    )
