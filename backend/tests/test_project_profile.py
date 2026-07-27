from __future__ import annotations

from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth.dependencies import Principal
from app.db.base import Base
from app.models.entities import Document, DocumentPage, TenderProject
from app.services.project_profile import build_project_profile_candidates


def test_profile_candidates_are_source_bound_and_do_not_change_project() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    tenant_id, user_id = uuid4(), uuid4()
    principal = Principal(tenant_id=tenant_id, user_id=user_id, role="bid_manager")
    with Session(engine) as db:
        project = TenderProject(
            tenant_id=tenant_id,
            created_by=user_id,
            organization_id=tenant_id,
            name="人工录入名称",
            project_code="MANUAL-001",
            buyer_name="人工录入采购人",
        )
        db.add(project)
        db.flush()
        document = Document(
            tenant_id=tenant_id,
            created_by=user_id,
            uploaded_by=user_id,
            project_id=project.id,
            document_type="tender_main",
            filename="招标文件.pdf",
            storage_key="test/profile.pdf",
            mime_type="application/pdf",
            size=1,
            sha256="a" * 64,
            parse_status="completed",
            page_count=1,
        )
        db.add(document)
        db.flush()
        db.add(
            DocumentPage(
                tenant_id=tenant_id,
                created_by=user_id,
                document_id=document.id,
                page_number=3,
                raw_text=(
                    "项目名称：智能园区建设项目\n采购人：某市数据局\n"
                    "项目编号：SZCG-2026-001\n投标截止时间：2026年08月01日 09:30"
                ),
                markdown="",
            )
        )
        db.flush()

        profile = build_project_profile_candidates(db, principal, project.id)

        assert profile["review_state"] == "manual_review"
        assert profile["candidate_count"] == 4
        assert profile["candidates"]["deadline"]["value"] == "2026年08月01日 09:30"
        for field in ("name", "buyer_name", "project_code", "deadline"):
            candidate = profile["candidates"][field]
            assert candidate["document_id"] == str(document.id)
            assert candidate["filename"] == "招标文件.pdf"
            assert candidate["page"] == 3
            assert candidate["excerpt"]
            assert candidate["confidence"] == 0.9
            assert candidate["review_state"] == "manual_review"
        # Candidates must never silently overwrite user-managed project values.
        assert project.name == "人工录入名称"
        assert project.project_code == "MANUAL-001"
        assert project.buyer_name == "人工录入采购人"
    engine.dispose()


def test_profile_candidates_mark_unfound_fields_missing() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    tenant_id, user_id = uuid4(), uuid4()
    principal = Principal(tenant_id=tenant_id, user_id=user_id, role="admin")
    with Session(engine) as db:
        project = TenderProject(
            tenant_id=tenant_id,
            created_by=user_id,
            organization_id=tenant_id,
            name="项目",
            project_code="P-1",
            buyer_name="采购人",
        )
        db.add(project)
        db.flush()

        profile = build_project_profile_candidates(db, principal, project.id)

        assert profile["candidate_count"] == 0
        for candidate in profile["candidates"].values():
            assert candidate["review_state"] == "missing"
            assert candidate["value"] is None
            assert candidate["document_id"] is None
            assert candidate["page"] is None
    engine.dispose()
