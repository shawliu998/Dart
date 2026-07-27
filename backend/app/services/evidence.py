from __future__ import annotations

from datetime import date
from decimal import Decimal
import re
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import append_event
from app.auth.dependencies import Principal
from app.models.entities import (
    Document,
    DocumentPage,
    EvidenceAsset,
    EvidenceClaim,
    EvidenceMatch,
    Organization,
    Requirement,
)
from app.rules.core import normalize_legal_name
from app.schemas.domain import EvidenceCreate, EvidenceUpdate

RESTRICTED_ROLES = {
    "legal": {"admin", "legal"},
    "finance": {"admin", "finance"},
    "confidential": {"admin", "legal", "finance"},
}


class EvidenceClaimCandidate(BaseModel):
    claim_type: str = Field(min_length=2, max_length=60)
    subject: str = Field(min_length=1, max_length=300)
    predicate: str = Field(min_length=1, max_length=300)
    value: str = Field(min_length=1)
    unit: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    source_page: int = Field(ge=1)
    source_text: str = Field(min_length=1, max_length=2000)
    confidence: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))


class EvidenceClaimBatch(BaseModel):
    claims: list[EvidenceClaimCandidate]


_CLAIM_RULES: dict[str, tuple[str, str]] = {
    "企业名称": ("legal_identity", "法定名称"),
    "统一社会信用代码": ("legal_identity", "统一社会信用代码"),
    "持证主体": ("legal_identity", "持证主体"),
    "证书": ("certification", "持有认证"),
    "有效期至": ("expiry_date", "有效期至"),
    "案例": ("customer_reference", "实施案例"),
    "合同金额": ("contract_amount", "合同金额"),
    "对应验收材料": ("acceptance_link", "验收材料"),
    "姓名": ("person_identity", "姓名"),
    "相关从业经验": ("experience", "相关从业经验"),
    "验收结论": ("acceptance_result", "验收结论"),
    "验收日期": ("acceptance_date", "验收日期"),
    "对应合同": ("contract_link", "对应合同"),
}


def _date_value(value: str) -> date | None:
    matched = re.search(r"\d{4}-\d{2}-\d{2}", value)
    if matched is None:
        return None
    try:
        return date.fromisoformat(matched.group(0))
    except ValueError:
        return None


def _page_claims(asset: EvidenceAsset, page: DocumentPage) -> EvidenceClaimBatch:
    """Extract conservative label/value claims while retaining exact source text."""
    pairs: list[tuple[str, str, str]] = []
    for raw_line in page.raw_text.splitlines():
        line = raw_line.strip()
        matched = re.match(r"^([^:：]{1,30})[:：]\s*(.+)$", line)
        if matched and matched.group(1).strip() in _CLAIM_RULES:
            pairs.append((matched.group(1).strip(), matched.group(2).strip(), line))

    page_case = next((value for label, value, _line in pairs if label == "案例"), None)
    person_name = next((value for label, value, _line in pairs if label == "姓名"), None)
    claims: list[EvidenceClaimCandidate] = []
    for label, raw_value, source_line in pairs:
        claim_type, predicate = _CLAIM_RULES[label]
        subject = asset.legal_entity
        value = raw_value
        unit = None
        valid_to = asset.expiry_date
        if label in {"合同金额", "对应验收材料", "验收结论", "验收日期", "对应合同"}:
            subject = page_case or asset.name
        elif label == "姓名":
            subject = "项目负责人"
        elif label == "相关从业经验":
            subject = person_name or asset.name
        elif label == "有效期至":
            subject = asset.name
        elif label == "持证主体":
            subject = raw_value
        if label == "合同金额":
            numeric = re.search(r"[\d,.]+", raw_value)
            value = numeric.group(0).replace(",", "") if numeric else raw_value
            unit = "CNY" if "元" in raw_value else None
        elif label == "相关从业经验":
            numeric = re.search(r"\d+(?:\.\d+)?", raw_value)
            value = numeric.group(0) if numeric else raw_value
            unit = "year" if "年" in raw_value else None
        elif label in {"有效期至", "验收日期"}:
            parsed_date = _date_value(raw_value)
            value = parsed_date.isoformat() if parsed_date else raw_value
            valid_to = parsed_date if label == "有效期至" else asset.expiry_date
        claims.append(
            EvidenceClaimCandidate(
                claim_type=claim_type,
                subject=subject,
                predicate=predicate,
                value=value,
                unit=unit,
                valid_from=asset.effective_date,
                valid_to=valid_to,
                source_page=page.page_number,
                source_text=source_line,
                confidence=Decimal("0.920"),
            )
        )
    if not claims and page.raw_text.strip():
        excerpt = page.raw_text.strip()[:2000]
        claims.append(
            EvidenceClaimCandidate(
                claim_type="source_excerpt",
                subject=asset.legal_entity,
                predicate="材料原文摘录",
                value=asset.name,
                valid_from=asset.effective_date,
                valid_to=asset.expiry_date,
                source_page=page.page_number,
                source_text=excerpt,
                confidence=Decimal("0.550"),
            )
        )
    return EvidenceClaimBatch(claims=claims)


def _can_view(asset: EvidenceAsset, principal: Principal) -> bool:
    return principal.role in RESTRICTED_ROLES.get(asset.sensitivity, {principal.role})


def get_asset(db: Session, principal: Principal, asset_id: UUID) -> EvidenceAsset:
    asset = db.scalar(
        select(EvidenceAsset).where(
            EvidenceAsset.id == asset_id,
            EvidenceAsset.tenant_id == principal.tenant_id,
            EvidenceAsset.deleted_at.is_(None),
        )
    )
    if asset is None or not _can_view(asset, principal):
        raise HTTPException(status_code=404, detail="evidence not found")
    return asset


def list_assets(db: Session, principal: Principal) -> list[EvidenceAsset]:
    assets = list(
        db.scalars(
            select(EvidenceAsset).where(
                EvidenceAsset.tenant_id == principal.tenant_id,
                EvidenceAsset.deleted_at.is_(None),
            )
        )
    )
    return [asset for asset in assets if _can_view(asset, principal)]


def create_asset(db: Session, principal: Principal, data: EvidenceCreate) -> EvidenceAsset:
    document = db.scalar(
        select(Document).where(
            Document.id == data.document_id, Document.tenant_id == principal.tenant_id
        )
    )
    if document is None:
        raise HTTPException(status_code=404, detail="document not found")
    asset = EvidenceAsset(
        tenant_id=principal.tenant_id,
        organization_id=principal.tenant_id,
        created_by=principal.user_id,
        owner_id=principal.user_id,
        **data.model_dump(),
    )
    db.add(asset)
    db.flush()
    append_event(
        db,
        principal,
        action="evidence.created",
        entity_type="evidence",
        entity_id=asset.id,
        project_id=document.project_id,
        after=data.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(asset)
    return asset


def update_asset(
    db: Session, principal: Principal, asset: EvidenceAsset, data: EvidenceUpdate
) -> EvidenceAsset:
    fields = data.model_fields_set - {"reason"}
    before = {field: getattr(asset, field) for field in fields}
    for field in fields:
        setattr(asset, field, getattr(data, field))
    asset.version += 1
    asset.reviewed_by = principal.user_id
    from app.db.base import utcnow

    asset.reviewed_at = utcnow()
    document = db.get(Document, asset.document_id)
    append_event(
        db,
        principal,
        action="evidence.updated",
        entity_type="evidence",
        entity_id=asset.id,
        project_id=document.project_id if document else None,
        before=before,
        after={**{field: getattr(asset, field) for field in fields}, "reason": data.reason},
    )
    db.commit()
    db.refresh(asset)
    return asset


def extract_claims(db: Session, principal: Principal, asset: EvidenceAsset) -> list[EvidenceClaim]:
    existing = list(
        db.scalars(select(EvidenceClaim).where(EvidenceClaim.evidence_asset_id == asset.id))
    )
    if existing:
        return existing
    pages = list(
        db.scalars(
            select(DocumentPage)
            .where(DocumentPage.document_id == asset.document_id)
            .order_by(DocumentPage.page_number)
        )
    )
    extracted_count = 0
    for page in pages:
        batch = _page_claims(asset, page)
        for claim in batch.claims:
            db.add(
                EvidenceClaim(
                    tenant_id=principal.tenant_id,
                    created_by=principal.user_id,
                    evidence_asset_id=asset.id,
                    claim_type=claim.claim_type,
                    subject=claim.subject,
                    predicate=claim.predicate,
                    value=claim.value,
                    unit=claim.unit,
                    valid_from=claim.valid_from,
                    valid_to=claim.valid_to,
                    source_page=claim.source_page,
                    source_text=claim.source_text,
                    extraction_confidence=claim.confidence,
                    human_verified=False,
                )
            )
            extracted_count += 1
    db.flush()
    document = db.get(Document, asset.document_id)
    append_event(
        db,
        principal,
        action="evidence.claims_extracted",
        entity_type="evidence",
        entity_id=asset.id,
        project_id=document.project_id if document else None,
        after={"count": extracted_count, "provider": "deterministic_label_value_v2"},
    )
    db.commit()
    return list(
        db.scalars(select(EvidenceClaim).where(EvidenceClaim.evidence_asset_id == asset.id))
    )


def _expected_types(requirement: Requirement) -> set[str]:
    text = f"{requirement.title} {requirement.normalized_requirement}".lower()
    if "验收" in text:
        return {"acceptance_report"}
    if "营业执照" in text:
        return {"business_license"}
    if "iso 9001" in text or "iso9001" in text:
        return {"iso_certificate", "qualification_certificate"}
    if "iso 27001" in text or "iso27001" in text:
        return {"iso_certificate", "qualification_certificate"}
    if requirement.category == "case" or "案例" in text or "业绩" in text:
        return {"contract", "acceptance_report"}
    if requirement.category == "personnel" or "项目负责人" in text or "人员" in text:
        return {"staff_certificate", "resume"}
    if "等保" in text or "安全" in text:
        return {"product_certificate", "test_report", "qualification_certificate"}
    return set()


def _asset_entity_matches(asset: EvidenceAsset, expected_legal_name: str) -> bool:
    return bool(expected_legal_name) and (
        normalize_legal_name(asset.legal_entity) == normalize_legal_name(expected_legal_name)
    )


def _asset_is_current(asset: EvidenceAsset, claim: EvidenceClaim, on_date: date) -> bool:
    return (
        asset.status not in {"expired", "invalid", "revoked"}
        and (asset.expiry_date is None or asset.expiry_date >= on_date)
        and (claim.valid_to is None or claim.valid_to >= on_date)
    )


def suggest_matches(
    db: Session, principal: Principal, project_id: UUID, *, provisional: bool = False
) -> list[EvidenceMatch]:
    requirements = list(
        db.scalars(
            select(Requirement).where(
                Requirement.project_id == project_id,
                Requirement.tenant_id == principal.tenant_id,
                Requirement.is_current.is_(True),
            )
        )
    )
    claims = list(
        db.scalars(select(EvidenceClaim).where(EvidenceClaim.tenant_id == principal.tenant_id))
    )
    organization = db.get(Organization, principal.tenant_id)
    expected_legal_name = normalize_legal_name(organization.legal_name) if organization else ""
    today = date.today()
    for requirement in requirements:
        expected = _expected_types(requirement)
        if not expected:
            continue
        for claim in claims:
            if claim.extraction_confidence < Decimal("0.700"):
                continue
            asset = db.get(EvidenceAsset, claim.evidence_asset_id)
            if asset is None or not _can_view(asset, principal):
                continue
            type_ok = asset.evidence_type in expected
            entity_ok = _asset_entity_matches(asset, expected_legal_name)
            valid = _asset_is_current(asset, claim, today)
            score = (
                (0.55 if type_ok else 0.0) + (0.25 if entity_ok else 0.0) + (0.2 if valid else 0.0)
            )
            if score < 0.55:
                continue
            existing = db.scalar(
                select(EvidenceMatch).where(
                    EvidenceMatch.requirement_id == requirement.id,
                    EvidenceMatch.evidence_claim_id == claim.id,
                )
            )
            if existing:
                continue
            reasons = [
                f"类型{'匹配' if type_ok else '不匹配'}",
                f"材料主体{'一致' if entity_ok else '不一致'}",
                f"有效期{'有效' if valid else '已过期'}",
            ]
            db.add(
                EvidenceMatch(
                    tenant_id=principal.tenant_id,
                    created_by=principal.user_id,
                    requirement_id=requirement.id,
                    evidence_claim_id=claim.id,
                    match_score=score,
                    match_type="deterministic",
                    status=(
                        "provisional_match"
                        if provisional and score >= 0.85 and type_ok and entity_ok and valid
                        else "suggested" if entity_ok and valid else "needs_review"
                    ),
                    reason="；".join(reasons) + "；系统仅建议，须人工接受",
                    created_by_ai=False,
                )
            )
    db.commit()
    matches = list(
        db.scalars(
            select(EvidenceMatch)
            .join(Requirement, Requirement.id == EvidenceMatch.requirement_id)
            .where(
                Requirement.project_id == project_id,
                Requirement.is_current.is_(True),
                EvidenceMatch.tenant_id == principal.tenant_id,
            )
        )
    )
    append_event(
        db,
        principal,
        action="evidence.matches_suggested",
        entity_type="project",
        entity_id=project_id,
        project_id=project_id,
        after={
            "count": len(matches),
            "auto_accepted": 0,
            "provisional_count": sum(item.status == "provisional_match" for item in matches),
        },
    )
    db.commit()
    return matches


def decide_match(
    db: Session, principal: Principal, match_id: UUID, accepted: bool, reason: str
) -> EvidenceMatch:
    match = db.scalar(
        select(EvidenceMatch).where(
            EvidenceMatch.id == match_id, EvidenceMatch.tenant_id == principal.tenant_id
        )
    )
    if match is None:
        raise HTTPException(status_code=404, detail="evidence match not found")
    requirement = db.get(Requirement, match.requirement_id)
    match.status = "accepted" if accepted else "rejected"
    match.human_decision = match.status
    match.human_reason = reason
    match.version += 1
    append_event(
        db,
        principal,
        action=f"evidence_match.{match.status}",
        entity_type="evidence_match",
        entity_id=match.id,
        project_id=requirement.project_id if requirement else None,
        before={"status": "suggested"},
        after={"status": match.status, "reason": reason},
    )
    db.commit()
    db.refresh(match)
    return match
