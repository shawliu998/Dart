"""Deterministic, evidence-bound tender response drafts.

The first MVP intentionally does not let a model invent bidder facts.  A richer provider may
rewrite the draft later, but the persisted links are always limited to human-accepted claims.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import append_event
from app.auth.dependencies import Principal
from app.db.base import utcnow
from app.models.entities import DisqualificationRule, EvidenceClaim, EvidenceMatch, Requirement, ResponseEvidenceLink, ResponseItem


def _usable_claims(
    db: Session, requirement_id: UUID, tenant_id: UUID, *, allow_provisional: bool
) -> list[EvidenceClaim]:
    statuses = ["accepted"]
    if allow_provisional:
        statuses.append("provisional_match")
    return list(
        db.scalars(
            select(EvidenceClaim)
            .join(EvidenceMatch, EvidenceMatch.evidence_claim_id == EvidenceClaim.id)
            .where(
                EvidenceMatch.requirement_id == requirement_id,
                EvidenceMatch.tenant_id == tenant_id,
                EvidenceMatch.status.in_(statuses),
            )
        )
    )


def _is_disqualification_candidate(db: Session, requirement: Requirement) -> bool:
    rule = db.scalar(
        select(DisqualificationRule).where(
            DisqualificationRule.requirement_id == requirement.id,
            DisqualificationRule.tenant_id == requirement.tenant_id,
            DisqualificationRule.decision == "candidate",
        )
    )
    return rule is not None


def _has_missing_source(requirement: Requirement) -> bool:
    return (
        requirement.source_document_id is None
        or requirement.source_page is None
        or not requirement.original_text.strip()
    )


def generate_project_responses(
    db: Session, principal: Principal, project_id: UUID, *, allow_provisional: bool = False
) -> list[ResponseItem]:
    """Create or refresh one draft per project requirement.

    Every requirement receives a ResponseItem.  Existing human edits and approved items are
    preserved.  Conservative autonomous mapping sends disqualification, low-confidence and
    missing-source items to manual review without making unsupported satisfaction claims.
    """
    requirement_filters = [
        Requirement.project_id == project_id,
        Requirement.tenant_id == principal.tenant_id,
    ]
    if not allow_provisional:
        requirement_filters.append(Requirement.human_verified.is_(True))
    requirements = list(db.scalars(select(Requirement).where(*requirement_filters)))
    generated = 0
    for requirement in requirements:
        item = db.scalar(
            select(ResponseItem).where(
                ResponseItem.project_id == project_id,
                ResponseItem.requirement_id == requirement.id,
                ResponseItem.tenant_id == principal.tenant_id,
            )
        )
        if item is not None and (item.edited_text or item.status == "approved"):
            continue
        if item is None:
            is_new = True
            item = ResponseItem(
                tenant_id=principal.tenant_id,
                created_by=principal.user_id,
                project_id=project_id,
                requirement_id=requirement.id,
            )
            db.add(item)
            db.flush()
        else:
            is_new = False

        db.query(ResponseEvidenceLink).filter(
            ResponseEvidenceLink.response_item_id == item.id
        ).delete(synchronize_session=False)

        if allow_provisional and _is_disqualification_candidate(db, requirement):
            item.status = "needs_review"
            item.response_strategy = "否决风险条款，需优先人工确认"
            item.draft_text = f"【待确认：条款“{requirement.title}”存在否决风险，需人工确认后编写响应】"
            item.missing_information = []
            item.risk_notes = ["潜在否决条款；未作满足性声明。"]
            item.confidence = Decimal("0.000")
        elif allow_provisional and requirement.extraction_confidence < Decimal("0.700"):
            item.status = "needs_review"
            item.response_strategy = "低置信度条款，需人工确认原始文本"
            item.draft_text = "【待人工确认原始条款后编写响应】"
            item.missing_information = []
            item.risk_notes = ["提取置信度低于 0.70，未作满足性声明。"]
            item.confidence = requirement.extraction_confidence
        elif allow_provisional and _has_missing_source(requirement):
            item.status = "needs_review"
            item.response_strategy = "缺少可展示来源，需核实条款来源"
            item.draft_text = "【待核实条款来源后编写响应】"
            item.missing_information = []
            item.risk_notes = ["缺少来源文档、页码或原文摘录。"]
            item.confidence = Decimal("0.000")
        elif allow_provisional and requirement.review_status == "manual_review":
            item.status = "needs_review"
            item.response_strategy = "条款处于人工复核状态，确认后再编写响应"
            item.draft_text = f"【待人工复核条款“{requirement.title}”后编写响应】"
            item.missing_information = []
            item.risk_notes = ["条款复核状态为 manual_review，未作满足性声明。"]
            item.confidence = requirement.extraction_confidence
        else:
            claims = _usable_claims(
                db, requirement.id, principal.tenant_id, allow_provisional=allow_provisional
            )
            for claim in claims:
                db.add(
                    ResponseEvidenceLink(
                        tenant_id=principal.tenant_id,
                        created_by=principal.user_id,
                        response_item_id=item.id,
                        evidence_claim_id=claim.id,
                    )
                )
            if claims:
                references = "；".join(f"{claim.subject}：{claim.value}" for claim in claims[:3])
                item.status = "drafted"
                item.response_strategy = (
                    "基于人工接受的材料逐条响应"
                    if not allow_provisional
                    else "内部草稿：基于待人工复核的要求和证据候选"
                )
                item.draft_text = f"我方响应“{requirement.title}”。已提供并引用以下材料：{references}。"
                item.missing_information = []
                item.risk_notes = ["内部草稿，未经最终人工确认。"] if allow_provisional else []
                item.confidence = Decimal("0.820")
            else:
                item.status = "missing_evidence"
                item.response_strategy = "需要补充已确认的证明材料"
                item.draft_text = f"【待补充：证明“{requirement.title}”所需的企业材料】"
                item.missing_information = [requirement.title]
                item.risk_notes = ["没有人工接受的证据，草稿未作满足性声明。"]
                item.confidence = Decimal("0.000")
        if not is_new:
            item.generation_version += 1
        item.version += 1
        generated += 1
    db.commit()
    append_event(
        db,
        principal,
        action="responses.generated",
        entity_type="project",
        entity_id=project_id,
        project_id=project_id,
        after={
            "generated": generated,
            "source": "accepted_or_provisional" if allow_provisional else "accepted_evidence_only",
        },
    )
    db.commit()
    return list(
        db.scalars(
            select(ResponseItem)
            .where(ResponseItem.project_id == project_id, ResponseItem.tenant_id == principal.tenant_id)
            .order_by(ResponseItem.created_at)
        )
    )


def approve_response(db: Session, principal: Principal, item: ResponseItem, reason: str) -> ResponseItem:
    item.status = "approved"
    item.reviewed_by = principal.user_id
    item.reviewed_at = utcnow()
    item.version += 1
    append_event(
        db,
        principal,
        action="response.approved",
        entity_type="response_item",
        entity_id=item.id,
        project_id=item.project_id,
        after={"reason": reason},
    )
    db.commit()
    db.refresh(item)
    return item
