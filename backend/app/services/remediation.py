"""Create deterministic, deduplicated remediation tasks from persisted findings."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import append_event
from app.auth.dependencies import Principal
from app.models.entities import ComplianceCheck, RemediationTask, Requirement, ResponseItem


def _existing_source_ids(
    db: Session,
    principal: Principal,
    project_id: UUID,
    source_type: str,
) -> set[UUID]:
    return set(
        db.scalars(
            select(RemediationTask.source_id).where(
                RemediationTask.project_id == project_id,
                RemediationTask.tenant_id == principal.tenant_id,
                RemediationTask.source_type == source_type,
            )
        )
    )


def create_agent_remediation_tasks(
    db: Session,
    principal: Principal,
    project_id: UUID,
) -> list[RemediationTask]:
    """Create missing tasks without changing existing human task state."""
    created: list[RemediationTask] = []
    existing_checks = _existing_source_ids(
        db, principal, project_id, "agent_compliance_check"
    )
    checks = list(
        db.scalars(
            select(ComplianceCheck).where(
                ComplianceCheck.project_id == project_id,
                ComplianceCheck.tenant_id == principal.tenant_id,
                ComplianceCheck.result.in_(("fail", "manual_review")),
            )
        )
    )
    for check in checks:
        if check.id in existing_checks or check.reviewed_by is not None:
            continue
        task = RemediationTask(
            tenant_id=principal.tenant_id,
            created_by=principal.user_id,
            project_id=project_id,
            source_type="agent_compliance_check",
            source_id=check.id,
            title=f"处理合规检查：{check.rule_code}",
            description=f"{check.reason}\n期望：{check.expected}\n当前：{check.actual}",
            priority="fatal" if check.result == "fail" and check.severity == "fatal" else "high" if check.result == "fail" else "medium",
            status="todo",
            assignee_id=principal.user_id,
        )
        db.add(task)
        created.append(task)

    existing_responses = _existing_source_ids(
        db, principal, project_id, "agent_response_gap"
    )
    response_rows = db.execute(
        select(ResponseItem, Requirement)
        .join(Requirement, Requirement.id == ResponseItem.requirement_id)
        .where(
            ResponseItem.project_id == project_id,
            ResponseItem.tenant_id == principal.tenant_id,
            ResponseItem.status.in_(("missing_evidence", "needs_review")),
        )
    ).all()
    for response, requirement in response_rows:
        if response.id in existing_responses or response.reviewed_by is not None:
            continue
        missing = "；".join(response.missing_information or []) or "需要人工复核响应内容"
        task = RemediationTask(
            tenant_id=principal.tenant_id,
            created_by=principal.user_id,
            project_id=project_id,
            source_type="agent_response_gap",
            source_id=response.id,
            title=f"补全响应：{requirement.title}",
            description=missing,
            priority="high" if requirement.mandatory or requirement.disqualification_if_failed else "medium",
            status="todo",
            assignee_id=principal.user_id,
        )
        db.add(task)
        created.append(task)

    db.flush()
    for task in created:
        append_event(
            db,
            principal,
            action="task.created_by_agent",
            entity_type="task",
            entity_id=task.id,
            project_id=project_id,
            after={
                "source_type": task.source_type,
                "source_id": str(task.source_id),
                "priority": task.priority,
                "status": task.status,
            },
        )
    db.commit()
    return created
