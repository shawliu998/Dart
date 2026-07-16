from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import append_event
from app.auth.dependencies import Principal
from app.models.entities import DisqualificationRule, Requirement
from app.schemas.requirements import RequirementUpdate


def get_requirement(db: Session, principal: Principal, requirement_id: UUID) -> Requirement:
    item = db.scalar(
        select(Requirement).where(
            Requirement.id == requirement_id, Requirement.tenant_id == principal.tenant_id
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="requirement not found")
    return item


def decide_requirement(
    db: Session, principal: Principal, item: Requirement, decision: str, reason: str
) -> Requirement:
    before = {
        "review_status": item.review_status,
        "human_verified": item.human_verified,
        "review_reason": item.review_reason,
    }
    item.review_status = "unreviewed" if decision == "verify" else "not_applicable"
    item.human_verified = decision == "verify"
    item.review_reason = reason
    item.version += 1
    append_event(
        db,
        principal,
        action=f"requirement.{decision}",
        entity_type="requirement",
        entity_id=item.id,
        project_id=item.project_id,
        before=before,
        after={
            "review_status": item.review_status,
            "human_verified": item.human_verified,
            "review_reason": reason,
        },
    )
    db.commit()
    db.refresh(item)
    return item


def update_requirement(
    db: Session, principal: Principal, item: Requirement, data: RequirementUpdate
) -> Requirement:
    fields = data.model_fields_set - {"reason"}
    before = {field: getattr(item, field) for field in fields}
    for field in fields:
        setattr(item, field, getattr(data, field))
    item.human_verified = True
    item.review_reason = data.reason
    item.version += 1
    append_event(
        db,
        principal,
        action="requirement.updated",
        entity_type="requirement",
        entity_id=item.id,
        project_id=item.project_id,
        before=before,
        after={**{field: getattr(item, field) for field in fields}, "reason": data.reason},
    )
    db.commit()
    db.refresh(item)
    return item


def decide_disqualification(
    db: Session, principal: Principal, rule_id: UUID, confirmed: bool, reason: str
) -> DisqualificationRule:
    rule = db.scalar(
        select(DisqualificationRule).where(
            DisqualificationRule.id == rule_id,
            DisqualificationRule.tenant_id == principal.tenant_id,
        )
    )
    if rule is None:
        raise HTTPException(status_code=404, detail="disqualification candidate not found")
    requirement = get_requirement(db, principal, rule.requirement_id)
    before = {"decision": rule.decision, "human_confirmed": rule.human_confirmed}
    rule.decision = "confirmed" if confirmed else "rejected"
    rule.human_confirmed = confirmed
    rule.decision_reason = reason
    rule.version += 1
    append_event(
        db,
        principal,
        action=f"disqualification.{rule.decision}",
        entity_type="disqualification",
        entity_id=rule.id,
        project_id=requirement.project_id,
        before=before,
        after={"decision": rule.decision, "human_confirmed": confirmed, "reason": reason},
    )
    db.commit()
    db.refresh(rule)
    return rule
