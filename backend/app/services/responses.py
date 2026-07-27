"""Deterministic, evidence-bound tender response drafts.

The first MVP intentionally does not let a model invent bidder facts.  A richer provider may
rewrite the draft later, but the persisted links are always limited to human-accepted claims.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import append_event
from app.auth.dependencies import Principal
from app.db.base import utcnow
from app.models.entities import (
    DisqualificationRule,
    EvidenceClaim,
    EvidenceMatch,
    Requirement,
    ResponseEvidenceLink,
    ResponseItem,
    ResponseRevision,
)


@dataclass(frozen=True)
class DeterministicDraft:
    status: str
    strategy: str
    text: str
    missing_information: list[str]
    risk_notes: list[str]
    confidence: Decimal


_CATEGORY_GROUPS = {
    "qualification": "qualification",
    "technical": "technical",
    "security": "technical",
    "service": "technical",
    "commercial": "commercial",
    "pricing": "commercial",
    "legal": "commercial",
    "personnel": "personnel",
    "case": "case",
    "delivery": "delivery",
    "format": "delivery",
    "submission": "delivery",
    "signature": "delivery",
}


def _category_group(requirement: Requirement) -> str:
    return _CATEGORY_GROUPS.get(requirement.category, "technical")


def _claim_summary(claims: list[EvidenceClaim]) -> str:
    if not claims:
        return "当前无可引用的已接受或暂定证据"
    return "；".join(
        f"{claim.subject}—{claim.predicate}：{claim.value}（第{claim.source_page}页）"
        for claim in claims[:4]
    )


def _deterministic_category_draft(
    requirement: Requirement,
    claims: list[EvidenceClaim],
    *,
    allow_provisional: bool,
) -> DeterministicDraft:
    """Build a category-specific internal draft without inventing bidder facts."""
    group = _category_group(requirement)
    references = _claim_summary(claims)
    requirement_text = requirement.normalized_requirement.strip() or requirement.title
    risk_notes = []
    if allow_provisional:
        risk_notes.append("内部草稿，未经最终人工确认。")
        if claims:
            risk_notes.append("引用包含暂定证据匹配，尚未人工接受。")

    if group == "qualification":
        strategy = "资格资质型响应"
        text = "\n".join(
            [
                "响应结论：已按本条资格要求检索企业材料，结论待人工复核。",
                f"投标主体：{claims[0].subject if claims else '待核实'}",
                f"资质或证书：{'；'.join(claim.value for claim in claims[:3]) if claims else '待补充'}",
                f"证书有效期：{'；'.join(str(claim.valid_to) for claim in claims if claim.valid_to) or '待核实'}",
                f"引用材料：{references}",
            ]
        )
    elif group == "commercial":
        strategy = "商务条件型响应"
        text = "\n".join(
            [
                "商务承诺：当前为内部草稿，尚未形成对外最终承诺。",
                f"服务范围：围绕“{requirement_text}”进行商务确认。",
                "合同条件：待商务、法务及授权人员复核。",
                "履约安排：待确认费用、责任边界与时间要求后补充。",
                f"引用材料：{references}",
            ]
        )
    elif group == "personnel":
        strategy = "人员配置型响应"
        text = "\n".join(
            [
                f"拟投入人员：{'；'.join(claim.subject for claim in claims[:3]) if claims else '待补充'}",
                f"人员角色：按“{requirement.title}”要求待确认。",
                f"证书与经验：{'；'.join(f'{claim.predicate}：{claim.value}' for claim in claims[:4]) if claims else '待补充'}",
                "职责说明：待人员简历与项目分工复核后补充。",
                f"引用材料：{references}",
            ]
        )
    elif group == "case":
        strategy = "案例业绩型响应"
        text = "\n".join(
            [
                f"案例名称：{'；'.join(claim.value for claim in claims if claim.claim_type == 'customer_reference') or '待补充'}",
                "客户：以合同或验收材料记载为准，待复核。",
                f"项目内容：针对“{requirement_text}”评估案例相关性。",
                f"合同或验收材料：{references}",
                "与当前项目的相关性：待人工根据工作范围确认。",
            ]
        )
    elif group == "delivery":
        strategy = "交付计划型响应"
        text = "\n".join(
            [
                "交付周期：以招标文件及补充公告的经复核时间要求为准。",
                "实施阶段：建议按准备、实施、测试、验收编制内部计划。",
                f"关键节点：围绕“{requirement_text}”待项目负责人确认。",
                "验收安排：验收标准、责任人与交付物清单待补充。",
                f"引用材料：{references}",
            ]
        )
    else:
        strategy = "技术实施型响应"
        text = "\n".join(
            [
                "响应结论：已识别本条技术要求，当前结论待人工复核。",
                f"拟采用的技术方案：围绕“{requirement_text}”编制设计与实施说明。",
                "关键参数：以来源条款中的参数为准，禁止在草稿中自行推导。",
                "实施方法：待技术负责人补充具体架构、步骤与责任人。",
                "验证方式：待补充可测试的验收方法与判定标准。",
                f"引用材料：{references}",
                "待补信息：技术参数、实施细节、测试与验收标准。",
            ]
        )

    evidence_required = group in {"qualification", "personnel", "case"}
    if claims:
        status = "drafted"
        missing = []
        confidence = Decimal("0.820")
    elif evidence_required:
        status = "missing_evidence"
        missing = [f"补充{strategy}所需的可核实材料"]
        confidence = Decimal("0.000")
        risk_notes.append("当前无可用证据，未作满足性声明。")
    else:
        status = "needs_review"
        missing = [f"补充并复核{strategy}的具体内容"]
        confidence = Decimal("0.350")
        risk_notes.append("当前仅为类别化框架，未作满足性声明。")
    return DeterministicDraft(status, strategy, text, missing, risk_notes, confidence)


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


def _snapshot_revision(
    item: ResponseItem,
    *,
    event_type: str,
    created_by: UUID,
    created_at=None,
) -> ResponseRevision:
    return ResponseRevision(
        tenant_id=item.tenant_id,
        response_item_id=item.id,
        revision_number=item.revision_number,
        event_type=event_type,
        draft_text=item.draft_text,
        edited_text=item.edited_text,
        status=item.status,
        generation_version=item.generation_version,
        created_by=created_by,
        **({"created_at": created_at} if created_at is not None else {}),
    )


def ensure_response_baseline(db: Session, item: ResponseItem) -> ResponseRevision:
    """Backfill a first snapshot for rows created outside the normal generation flow."""
    existing = db.scalar(
        select(ResponseRevision)
        .where(
            ResponseRevision.response_item_id == item.id,
            ResponseRevision.tenant_id == item.tenant_id,
        )
        .order_by(ResponseRevision.revision_number.desc())
    )
    if existing is not None:
        if item.revision_number < existing.revision_number:
            item.revision_number = existing.revision_number
        return existing
    item.revision_number = max(item.revision_number or 1, 1)
    baseline = _snapshot_revision(
        item,
        event_type="baseline",
        created_by=item.created_by,
        created_at=item.created_at,
    )
    db.add(baseline)
    db.flush()
    return baseline


def append_response_revision(
    db: Session,
    principal: Principal,
    item: ResponseItem,
    event_type: str,
    *,
    initial: bool = False,
) -> ResponseRevision:
    """Append a response snapshot inside the caller's transaction."""
    existing = db.scalar(
        select(ResponseRevision)
        .where(
            ResponseRevision.response_item_id == item.id,
            ResponseRevision.tenant_id == item.tenant_id,
        )
        .order_by(ResponseRevision.revision_number.desc())
    )
    if existing is None and initial:
        item.revision_number = max(item.revision_number or 1, 1)
    else:
        if existing is None:
            ensure_response_baseline(db, item)
        else:
            item.revision_number = max(item.revision_number, existing.revision_number)
        item.revision_number += 1
    revision = _snapshot_revision(
        item,
        event_type=event_type,
        created_by=principal.user_id,
    )
    db.add(revision)
    return revision


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
        Requirement.is_current.is_(True),
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
            ensure_response_baseline(db, item)

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
            draft = _deterministic_category_draft(
                requirement,
                claims,
                allow_provisional=allow_provisional,
            )
            item.status = draft.status
            item.response_strategy = draft.strategy
            item.draft_text = draft.text
            item.missing_information = draft.missing_information
            item.risk_notes = draft.risk_notes
            item.confidence = draft.confidence
        if not is_new:
            item.generation_version += 1
        item.version += 1
        append_response_revision(
            db,
            principal,
            item,
            "generated",
            initial=is_new,
        )
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
            .join(Requirement, Requirement.id == ResponseItem.requirement_id)
            .where(
                ResponseItem.project_id == project_id,
                ResponseItem.tenant_id == principal.tenant_id,
                Requirement.is_current.is_(True),
            )
            .order_by(ResponseItem.created_at)
        )
    )


def approve_response(db: Session, principal: Principal, item: ResponseItem, reason: str) -> ResponseItem:
    item.status = "approved"
    item.reviewed_by = principal.user_id
    item.reviewed_at = utcnow()
    item.version += 1
    append_response_revision(db, principal, item, "approved")
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
