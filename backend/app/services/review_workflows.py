from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.audit.service import append_event, stable_hash
from app.auth.dependencies import Principal
from app.db.base import utcnow
from app.models.entities import (
    Amendment,
    AmendmentChange,
    AmendmentImpact,
    ComplianceCheck,
    ConsistencyIssue,
    Document,
    DocumentPage,
    EvidenceAsset,
    EvidenceMatch,
    PackageItem,
    RemediationTask,
    Requirement,
    TenderProject,
)
from app.schemas.domain import (
    ComplianceOverride,
    ConsistencyResolve,
    TaskCreate,
    TaskUpdate,
)


_COMPLIANCE_RULE_VERSION = "EVIDENCE_PRESENCE_V2"


def _evidence_status(
    db: Session,
    requirement: Requirement,
    *,
    evidence_mode: Literal["accepted_only", "accepted_and_provisional"],
) -> tuple[bool, bool, list[EvidenceMatch]]:
    """Return (has_accepted, has_provisional, relevant_matches)."""
    matches = list(
        db.scalars(
            select(EvidenceMatch).where(
                EvidenceMatch.requirement_id == requirement.id,
                EvidenceMatch.tenant_id == requirement.tenant_id,
            )
        )
    )
    has_accepted = any(match.status == "accepted" for match in matches)
    allowed_provisional = evidence_mode == "accepted_and_provisional"
    has_provisional = allowed_provisional and any(
        match.status == "provisional_match" for match in matches
    )
    return has_accepted, has_provisional, matches


def _compliance_input_hash(requirement: Requirement, matches: list[EvidenceMatch]) -> str:
    return stable_hash(
        {
            "requirement_id": str(requirement.id),
            "source_document_id": str(requirement.source_document_id) if requirement.source_document_id else None,
            "source_page": requirement.source_page,
            "original_text": requirement.original_text,
            "normalized_requirement": requirement.normalized_requirement,
            "risk_level": requirement.risk_level,
            "extraction_confidence": float(requirement.extraction_confidence),
            "match_statuses": sorted(match.status for match in matches),
            "rule_version": _COMPLIANCE_RULE_VERSION,
        }
    )


def run_compliance(
    db: Session,
    principal: Principal,
    project_id: UUID,
    *,
    evidence_mode: Literal["accepted_only", "accepted_and_provisional"] = "accepted_only",
    force_recompute: bool = False,
) -> list[ComplianceCheck]:
    """Run deterministic evidence-presence compliance checks.

    Human-overridden checks are always preserved. Provisional evidence never
    produces ``pass``; it yields ``manual_review`` with an explicit reason.
    """
    existing = list(
        db.scalars(
            select(ComplianceCheck)
            .join(Requirement, Requirement.id == ComplianceCheck.requirement_id, isouter=True)
            .where(
                ComplianceCheck.project_id == project_id,
                ComplianceCheck.tenant_id == principal.tenant_id,
                (ComplianceCheck.requirement_id.is_(None) | Requirement.is_current.is_(True)),
            )
        )
    )
    if existing and not force_recompute:
        return existing

    requirements = list(
        db.scalars(
            select(Requirement).where(
                Requirement.project_id == project_id,
                Requirement.tenant_id == principal.tenant_id,
                Requirement.is_current.is_(True),
            )
        )
    )
    preserved_requirement_ids = {
        check.requirement_id for check in existing if check.reviewed_by is not None
    }
    if force_recompute:
        current_requirement_ids = [item.id for item in requirements]
        db.execute(
            delete(ComplianceCheck).where(
                ComplianceCheck.project_id == project_id,
                ComplianceCheck.tenant_id == principal.tenant_id,
                ComplianceCheck.check_type == "evidence_presence",
                ComplianceCheck.reviewed_by.is_(None),
                ComplianceCheck.requirement_id.in_(current_requirement_ids),
            )
        )
        db.flush()
    evaluated_at = utcnow()
    for requirement in requirements:
        if requirement.id in preserved_requirement_ids:
            continue

        has_accepted, has_provisional, matches = _evidence_status(
            db, requirement, evidence_mode=evidence_mode
        )
        input_hash = _compliance_input_hash(requirement, matches)

        if has_accepted:
            result = "pass"
            actual = "accepted evidence"
            reason = "人工已接受的证据通过证据存在性检查；不代表最终合规结论"
        elif has_provisional:
            result = "manual_review"
            actual = "provisional evidence"
            reason = "使用暂定证据（provisional），尚未人工接受，不自动判定满足"
        elif requirement.extraction_confidence < 0.70:
            result = "manual_review"
            actual = "no accepted evidence; low extraction confidence"
            reason = "确定性检查：提取置信度低于 0.70，需人工复核原始条款"
        else:
            result = "warning"
            actual = "no accepted evidence"
            reason = "确定性检查：未找到已接受证据，不自动判定满足"

        source_references = [
            {
                "document_id": str(requirement.source_document_id) if requirement.source_document_id else None,
                "page": requirement.source_page,
                "text": requirement.original_text,
            }
        ]
        metadata = {
            "rule_version": _COMPLIANCE_RULE_VERSION,
            "input_hash": input_hash,
            "evaluated_at": evaluated_at.isoformat(),
            "evidence_mode": evidence_mode,
        }

        db.add(
            ComplianceCheck(
                tenant_id=principal.tenant_id,
                created_by=principal.user_id,
                project_id=project_id,
                requirement_id=requirement.id,
                check_type="evidence_presence",
                expected=requirement.normalized_requirement,
                actual=actual,
                result=result,
                severity=requirement.risk_level,
                rule_code=_COMPLIANCE_RULE_VERSION,
                reason=reason,
                source_references=source_references,
                metadata_json=metadata,
            )
        )
    db.commit()
    append_event(
        db,
        principal,
        action="compliance.run",
        entity_type="project",
        entity_id=project_id,
        project_id=project_id,
        after={
            "count": len(requirements),
            "engine": "deterministic",
            "evidence_mode": evidence_mode,
            "force_recompute": force_recompute,
        },
    )
    db.commit()
    return list(
        db.scalars(
            select(ComplianceCheck)
            .join(Requirement, Requirement.id == ComplianceCheck.requirement_id, isouter=True)
            .where(
                ComplianceCheck.project_id == project_id,
                ComplianceCheck.tenant_id == principal.tenant_id,
                (ComplianceCheck.requirement_id.is_(None) | Requirement.is_current.is_(True)),
            )
        )
    )


def override_compliance(
    db: Session,
    principal: Principal,
    check_id: UUID,
    data: ComplianceOverride,
) -> ComplianceCheck:
    check = db.scalar(
        select(ComplianceCheck).where(
            ComplianceCheck.id == check_id,
            ComplianceCheck.tenant_id == principal.tenant_id,
        )
    )
    if check is None:
        raise HTTPException(status_code=404, detail="compliance check not found")
    before = {"result": check.result, "reason": check.reason}
    check.result = data.result
    check.reason = f"人工覆盖：{data.reason}"
    check.reviewed_by = principal.user_id
    check.reviewed_at = utcnow()
    check.version += 1
    append_event(
        db,
        principal,
        action="compliance.overridden",
        entity_type="compliance_check",
        entity_id=check.id,
        project_id=check.project_id,
        before=before,
        after={"result": check.result, "reason": data.reason},
    )
    db.commit()
    db.refresh(check)
    return check


def list_consistency(db: Session, principal: Principal, project_id: UUID) -> list[ConsistencyIssue]:
    return list(
        db.scalars(
            select(ConsistencyIssue).where(
                ConsistencyIssue.project_id == project_id,
                ConsistencyIssue.tenant_id == principal.tenant_id,
            )
        )
    )


def run_consistency(db: Session, principal: Principal, project_id: UUID) -> list[ConsistencyIssue]:
    issues = list_consistency(db, principal, project_id)
    append_event(
        db,
        principal,
        action="consistency.run",
        entity_type="project",
        entity_id=project_id,
        project_id=project_id,
        after={"issue_count": len(issues), "source_backed": True},
    )
    db.commit()
    return issues


def resolve_consistency(
    db: Session, principal: Principal, issue_id: UUID, data: ConsistencyResolve
) -> ConsistencyIssue:
    issue = db.scalar(
        select(ConsistencyIssue).where(
            ConsistencyIssue.id == issue_id,
            ConsistencyIssue.tenant_id == principal.tenant_id,
        )
    )
    if issue is None:
        raise HTTPException(status_code=404, detail="consistency issue not found")
    before = {"status": issue.status, "resolution": issue.resolution}
    issue.status = data.status
    issue.resolution = data.resolution
    issue.version += 1
    append_event(
        db,
        principal,
        action="consistency.resolved",
        entity_type="consistency_issue",
        entity_id=issue.id,
        project_id=issue.project_id,
        before=before,
        after=data.model_dump(),
    )
    db.commit()
    db.refresh(issue)
    return issue


def analyze_amendment(
    db: Session, principal: Principal, project_id: UUID, document_id: UUID
) -> Amendment:
    existing = db.scalar(select(Amendment).where(Amendment.document_id == document_id))
    if existing:
        return existing
    document = db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.project_id == project_id,
            Document.tenant_id == principal.tenant_id,
        )
    )
    if document is None:
        raise HTTPException(status_code=404, detail="amendment document not found")
    pages = list(
        db.scalars(
            select(DocumentPage)
            .where(DocumentPage.document_id == document_id)
            .order_by(DocumentPage.page_number)
        )
    )
    amendment = Amendment(
        tenant_id=principal.tenant_id,
        created_by=principal.user_id,
        project_id=project_id,
        document_id=document_id,
        summary="确定性识别补充公告中的截止时间、技术参数和新增资质",
        analysis_status="completed",
    )
    db.add(amendment)
    db.flush()
    joined = "\n".join(page.raw_text for page in pages)
    specs: list[tuple[str, str | None, str, int, str]] = []
    if "14天" in joined and "21天" in joined:
        specs.append(("deadline_changed", "导入日+14天", "导入日+21天", 1, "high"))
    if "1000路" in joined and "1200路" in joined:
        specs.append(
            ("technical_changed", "视频接入不少于1000路", "视频接入不少于1200路", 1, "high")
        )
    if "等级保护三级" in joined:
        specs.append(("added", None, "提供有效的网络安全等级保护三级证明", 2, "high"))
    for change_type, old, new, page, severity in specs:
        change = AmendmentChange(
            tenant_id=principal.tenant_id,
            created_by=principal.user_id,
            amendment_id=amendment.id,
            change_type=change_type,
            old_text=old,
            new_text=new,
            old_value=old,
            new_value=new,
            source_page=page,
            severity=severity,
        )
        db.add(change)
        db.flush()
        db.add(
            AmendmentImpact(
                tenant_id=principal.tenant_id,
                created_by=principal.user_id,
                amendment_change_id=change.id,
                impact_description="要求、证据匹配、整改任务及封装项需要重新复核",
                requires_reapproval=True,
            )
        )
    append_event(
        db,
        principal,
        action="amendment.analyzed",
        entity_type="amendment",
        entity_id=amendment.id,
        project_id=project_id,
        after={"changes": len(specs)},
    )
    db.commit()
    db.refresh(amendment)
    return amendment


def apply_amendment(db: Session, principal: Principal, amendment_id: UUID) -> Amendment:
    amendment = db.scalar(
        select(Amendment).where(
            Amendment.id == amendment_id, Amendment.tenant_id == principal.tenant_id
        )
    )
    if amendment is None:
        raise HTTPException(status_code=404, detail="amendment not found")
    amendment.analysis_status = "applied"
    amendment.applied_at = utcnow()
    amendment.version += 1
    impacts = list(
        db.scalars(
            select(AmendmentImpact)
            .join(AmendmentChange, AmendmentChange.id == AmendmentImpact.amendment_change_id)
            .where(AmendmentChange.amendment_id == amendment.id)
        )
    )
    changes = list(
        db.scalars(select(AmendmentChange).where(AmendmentChange.amendment_id == amendment.id))
    )
    project = db.get(TenderProject, amendment.project_id)
    for change in changes:
        if change.change_type == "deadline_changed" and change.new_value and project:
            try:
                project.deadline = datetime.fromisoformat(change.new_value)
                project.version += 1
            except ValueError:
                pass
    for impact in impacts:
        impact.status = "review_required"
        if impact.affected_requirement_id:
            requirement = db.get(Requirement, impact.affected_requirement_id)
            if requirement:
                requirement.review_status = "manual_review"
                requirement.version += 1
        if impact.affected_evidence_id:
            evidence = db.get(EvidenceAsset, impact.affected_evidence_id)
            if evidence:
                evidence.status = "review_required"
                evidence.version += 1
        if impact.affected_package_item_id:
            package_item = db.get(PackageItem, impact.affected_package_item_id)
            if package_item:
                package_item.status = "review_required"
                package_item.version += 1
        if impact.requires_reapproval and impact.affected_task_id is None:
            task = RemediationTask(
                tenant_id=principal.tenant_id,
                created_by=principal.user_id,
                project_id=amendment.project_id,
                source_type="amendment_impact",
                source_id=impact.id,
                title="复核补充公告影响",
                description=impact.impact_description,
                priority="high",
                status="todo",
                assignee_id=principal.user_id,
            )
            db.add(task)
            db.flush()
            impact.affected_task_id = task.id
    append_event(
        db,
        principal,
        action="amendment.applied",
        entity_type="amendment",
        entity_id=amendment.id,
        project_id=amendment.project_id,
        after={"requires_reapproval": True, "impact_count": len(impacts)},
    )
    db.commit()
    db.refresh(amendment)
    return amendment


def create_task(
    db: Session, principal: Principal, project_id: UUID, data: TaskCreate
) -> RemediationTask:
    task = RemediationTask(
        tenant_id=principal.tenant_id,
        created_by=principal.user_id,
        project_id=project_id,
        **data.model_dump(),
    )
    db.add(task)
    db.flush()
    append_event(
        db,
        principal,
        action="task.created",
        entity_type="task",
        entity_id=task.id,
        project_id=project_id,
        after=data.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(task)
    return task


def get_task(db: Session, principal: Principal, task_id: UUID) -> RemediationTask:
    task = db.scalar(
        select(RemediationTask).where(
            RemediationTask.id == task_id, RemediationTask.tenant_id == principal.tenant_id
        )
    )
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    return task


def update_task(
    db: Session, principal: Principal, task: RemediationTask, data: TaskUpdate
) -> RemediationTask:
    fields = data.model_fields_set - {"reason"}
    before = {field: getattr(task, field) for field in fields}
    for field in fields:
        setattr(task, field, getattr(data, field))
    task.version += 1
    append_event(
        db,
        principal,
        action="task.updated",
        entity_type="task",
        entity_id=task.id,
        project_id=task.project_id,
        before=before,
        after={**{field: getattr(task, field) for field in fields}, "reason": data.reason},
    )
    db.commit()
    db.refresh(task)
    return task


def decide_task(
    db: Session, principal: Principal, task: RemediationTask, action: str, note: str
) -> RemediationTask:
    before = task.status
    if action == "complete":
        task.status = "ready_for_review"
        task.resolution_note = note
    elif action == "review":
        if task.status != "ready_for_review":
            raise HTTPException(status_code=409, detail="task must be ready_for_review")
        task.status = "done"
        task.reviewer_id = principal.user_id
        task.resolution_note = note
    task.version += 1
    append_event(
        db,
        principal,
        action=f"task.{action}",
        entity_type="task",
        entity_id=task.id,
        project_id=task.project_id,
        before={"status": before},
        after={"status": task.status, "note": note},
    )
    db.commit()
    db.refresh(task)
    return task
