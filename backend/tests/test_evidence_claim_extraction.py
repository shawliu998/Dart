from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import delete

from app.auth.dependencies import Principal
from app.db.session import SessionLocal
from app.models.entities import Document, DocumentPage, EvidenceAsset, EvidenceClaim
from app.services.evidence import extract_claims


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
