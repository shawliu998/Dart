from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import HTTPException
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
    Requirement,
)
from app.rules.core import normalize_legal_name
from app.schemas.domain import EvidenceCreate, EvidenceUpdate

RESTRICTED_ROLES = {
    "legal": {"admin", "legal"},
    "finance": {"admin", "finance"},
    "confidential": {"admin", "legal", "finance"},
}


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
    for page in pages:
        text = page.raw_text.strip()
        db.add(
            EvidenceClaim(
                tenant_id=principal.tenant_id,
                created_by=principal.user_id,
                evidence_asset_id=asset.id,
                claim_type=asset.evidence_type,
                subject=asset.legal_entity,
                predicate="提供材料证明",
                value=asset.name,
                valid_from=asset.effective_date,
                valid_to=asset.expiry_date,
                source_page=page.page_number,
                source_text=text[:2000],
                extraction_confidence=0.82,
                human_verified=False,
            )
        )
    db.flush()
    document = db.get(Document, asset.document_id)
    append_event(
        db,
        principal,
        action="evidence.claims_extracted",
        entity_type="evidence",
        entity_id=asset.id,
        project_id=document.project_id if document else None,
        after={"count": len(pages), "provider": "deterministic"},
    )
    db.commit()
    return list(
        db.scalars(select(EvidenceClaim).where(EvidenceClaim.evidence_asset_id == asset.id))
    )


def _expected_types(requirement: Requirement) -> set[str]:
    text = f"{requirement.title} {requirement.normalized_requirement}".lower()
    if "营业执照" in text:
        return {"business_license"}
    if "iso 9001" in text or "iso9001" in text:
        return {"iso_certificate", "qualification_certificate"}
    if "iso 27001" in text or "iso27001" in text:
        return {"iso_certificate", "qualification_certificate"}
    if "案例" in text:
        return {"contract", "acceptance_report", "customer_reference"}
    if "项目负责人" in text or "人员" in text:
        return {"staff_certificate", "resume"}
    if "等保" in text or "安全" in text:
        return {"product_certificate", "test_report", "qualification_certificate"}
    return set()


def suggest_matches(db: Session, principal: Principal, project_id: UUID) -> list[EvidenceMatch]:
    requirements = list(
        db.scalars(
            select(Requirement).where(
                Requirement.project_id == project_id,
                Requirement.tenant_id == principal.tenant_id,
            )
        )
    )
    claims = list(
        db.scalars(select(EvidenceClaim).where(EvidenceClaim.tenant_id == principal.tenant_id))
    )
    today = date.today()
    for requirement in requirements:
        expected = _expected_types(requirement)
        if not expected:
            continue
        for claim in claims:
            asset = db.get(EvidenceAsset, claim.evidence_asset_id)
            if asset is None or not _can_view(asset, principal):
                continue
            type_ok = asset.evidence_type in expected
            entity_ok = normalize_legal_name(asset.legal_entity) == normalize_legal_name(
                claim.subject
            )
            valid = claim.valid_to is None or claim.valid_to >= today
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
                f"主体{'一致' if entity_ok else '不一致'}",
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
                    status="suggested" if entity_ok and valid else "needs_review",
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
        after={"count": len(matches), "auto_accepted": 0},
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
