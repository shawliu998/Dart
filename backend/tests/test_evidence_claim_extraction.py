from __future__ import annotations

from datetime import date
from uuid import UUID, uuid4

from sqlalchemy import delete

from app.auth.dependencies import Principal
from app.db.session import SessionLocal
from app.models.entities import Document, DocumentPage, EvidenceAsset, EvidenceClaim, Requirement
from app.services.evidence import (
    _asset_entity_matches,
    _asset_is_current,
    _expected_types,
    extract_claims,
)


def test_deterministic_extractor_creates_field_level_contract_claims(demo) -> None:
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]),
        user_id=UUID(demo["user_id"]),
        role="admin",
    )
    project_id = UUID(demo["project_id"])
    document_id = uuid4()
    asset_id = uuid4()
    with SessionLocal() as db:
        document = Document(
            id=document_id,
            tenant_id=principal.tenant_id,
            created_by=principal.user_id,
            project_id=project_id,
            document_type="evidence",
            filename="新案例合同.pdf",
            storage_key=f"test://{document_id}",
            mime_type="application/pdf",
            size=100,
            sha256=uuid4().hex * 2,
            parse_status="completed",
            page_count=1,
            uploaded_by=principal.user_id,
        )
        asset = EvidenceAsset(
            id=asset_id,
            tenant_id=principal.tenant_id,
            created_by=principal.user_id,
            organization_id=principal.tenant_id,
            name="智慧园区案例合同",
            evidence_type="contract",
            legal_entity="测试科技有限公司",
            document_id=document_id,
            status="active",
            sensitivity="internal",
        )
        db.add_all(
            [
                document,
                DocumentPage(
                    tenant_id=principal.tenant_id,
                    created_by=principal.user_id,
                    document_id=document_id,
                    page_number=1,
                    raw_text="案例：智慧园区\n合同金额：6,200,000元\n对应验收材料：验收报告A",
                    markdown="",
                    layout_json={},
                ),
                asset,
            ]
        )
        db.commit()
        claims = extract_claims(db, principal, asset)

        assert {item.claim_type for item in claims} == {
            "customer_reference",
            "contract_amount",
            "acceptance_link",
        }
        amount = next(item for item in claims if item.claim_type == "contract_amount")
        assert amount.subject == "智慧园区"
        assert amount.value == "6200000"
        assert amount.unit == "CNY"
        assert amount.source_page == 1
        assert amount.source_text == "合同金额：6,200,000元"
        assert all(not item.human_verified for item in claims)

        db.execute(delete(EvidenceClaim).where(EvidenceClaim.evidence_asset_id == asset_id))
        db.execute(delete(EvidenceAsset).where(EvidenceAsset.id == asset_id))
        db.execute(delete(DocumentPage).where(DocumentPage.document_id == document_id))
        db.execute(delete(Document).where(Document.id == document_id))
        db.commit()


def test_expected_evidence_types_separate_case_and_acceptance_proof() -> None:
    case_requirement = Requirement(
        title="近三年同类案例不少于2个",
        normalized_requirement="近三年同类案例不少于2个",
        category="case",
    )
    acceptance_requirement = Requirement(
        title="每个案例须提供验收证明",
        normalized_requirement="每个案例须提供验收证明",
        category="case",
    )
    personnel_requirement = Requirement(
        title="项目负责人相关经验不少于5年",
        normalized_requirement="项目负责人相关经验不少于5年",
        category="personnel",
    )

    assert _expected_types(case_requirement) == {"contract", "acceptance_report"}
    assert _expected_types(acceptance_requirement) == {"acceptance_report"}
    assert _expected_types(personnel_requirement) == {"staff_certificate", "resume"}


def test_match_hard_filters_use_asset_entity_status_and_expiry() -> None:
    asset = EvidenceAsset(
        legal_entity="上海智园数字科技有限公司",
        status="active",
        expiry_date=date(2027, 12, 31),
    )
    claim = EvidenceClaim(valid_to=date(2027, 12, 31))
    evaluation_date = date(2026, 7, 18)

    assert _asset_entity_matches(asset, "上海智园数字科技有限公司")
    assert not _asset_entity_matches(asset, "上海智园科技有限公司")
    assert _asset_is_current(asset, claim, evaluation_date)

    asset.status = "revoked"
    assert not _asset_is_current(asset, claim, evaluation_date)
    asset.status = "active"
    asset.expiry_date = date(2025, 12, 31)
    assert not _asset_is_current(asset, claim, evaluation_date)
