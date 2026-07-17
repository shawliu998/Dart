from __future__ import annotations

from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth.dependencies import Principal
from app.db.base import Base
from app.models.entities import Requirement, ResponseItem, TenderProject
from app.services.response_quality import INTERNAL_DRAFT_MARKER, run_response_quality_checks


def _item(db: Session, tenant_id, user_id, *, status: str = "drafted", draft_text: str | None = None, missing_information: list | None = None, edited_text: str | None = None) -> ResponseItem:
    project = TenderProject(tenant_id=tenant_id, created_by=user_id, organization_id=tenant_id, name="项目", project_code="P-1", buyer_name="采购人")
    db.add(project)
    db.flush()
    requirement = Requirement(tenant_id=tenant_id, created_by=user_id, project_id=project.id, category="other", title="材料要求", normalized_requirement="材料要求", original_text="材料要求", original_hash=uuid4().hex, mandatory=False, disqualification_if_failed=False, risk_level="medium", source_document_id=uuid4(), source_page=1, extraction_confidence=0.8)
    db.add(requirement)
    db.flush()
    item = ResponseItem(tenant_id=tenant_id, created_by=user_id, project_id=project.id, requirement_id=requirement.id, status=status, draft_text=draft_text, missing_information=missing_information or [], edited_text=edited_text, risk_notes=[])
    db.add(item)
    db.flush()
    return item


def test_response_quality_only_repairs_safe_internal_labels() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    tenant_id, user_id = uuid4(), uuid4()
    principal = Principal(tenant_id=tenant_id, user_id=user_id, role="bid_manager")
    with Session(engine) as db:
        item = _item(db, tenant_id, user_id, draft_text="我方响应", missing_information=["营业执照"])
        result = run_response_quality_checks(db, principal, item.project_id)

        codes = {issue.code for quality_pass in result.passes for issue in quality_pass.issues}
        assert {"draft_too_short", "missing_evidence_link", "missing_information", "generic_wording", "missing_internal_draft_marker"} <= codes
        assert len(result.passes) == 2
        assert result.repaired_count == 2
        assert result.observed_issue_count > result.issue_count
        assert result.before_summary != result.after_summary
        assert result.manual_review_required is True
        assert result.review_href == f"/projects/{item.project_id}/review"
        assert "【待补充：营业执照】" in (item.draft_text or "")
        assert INTERNAL_DRAFT_MARKER in item.risk_notes
        assert item.status == "drafted"
        assert item.edited_text is None
    engine.dispose()


def test_response_quality_does_not_change_approved_or_human_edited_items() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    tenant_id, user_id = uuid4(), uuid4()
    principal = Principal(tenant_id=tenant_id, user_id=user_id, role="admin")
    with Session(engine) as db:
        item = _item(db, tenant_id, user_id, status="approved", draft_text="{{不得修改}}", missing_information=["营业执照"], edited_text="人工编辑")
        before = (item.draft_text, list(item.risk_notes), item.status, item.edited_text)
        result = run_response_quality_checks(db, principal, item.project_id)

        assert result.repaired_count == 0
        assert (item.draft_text, item.risk_notes, item.status, item.edited_text) == before
        assert any(issue.code == "unresolved_template_placeholder" and issue.manual_review for issue in result.passes[0].issues)
    engine.dispose()


def test_response_quality_flags_inconsistent_missing_information_state() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    tenant_id, user_id = uuid4(), uuid4()
    principal = Principal(tenant_id=tenant_id, user_id=user_id, role="bid_manager")
    with Session(engine) as db:
        item = _item(
            db,
            tenant_id,
            user_id,
            status="missing_evidence",
            draft_text="【待补充：材料】",
            missing_information=[],
        )
        result = run_response_quality_checks(db, principal, item.project_id)

        assert any(
            issue.code == "missing_information_state" and issue.manual_review
            for issue in result.passes[0].issues
        )
        assert item.status == "missing_evidence"
    engine.dispose()
