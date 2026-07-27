from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select

from app.auth.dependencies import Principal
from app.db.session import SessionLocal
from app.models.entities import Document, DocumentPage, RemediationTask
from app.services.remediation import create_agent_remediation_tasks


def test_agent_remediation_tasks_are_source_bound_and_idempotent(demo) -> None:
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]),
        user_id=UUID(demo["user_id"]),
        role="admin",
    )
    project_id = UUID(demo["project_id"])
    with SessionLocal() as db:
        page, document = db.execute(
            select(DocumentPage, Document)
            .join(Document, Document.id == DocumentPage.document_id)
            .where(Document.project_id == project_id, Document.document_type == "tender_main")
            .order_by(DocumentPage.page_number)
        ).first()
        original_layout = page.layout_json
        page.layout_json = {**original_layout, "ocr_required": True}
        db.commit()

        first = create_agent_remediation_tasks(db, principal, project_id)
        second = create_agent_remediation_tasks(db, principal, project_id)

        assert first
        assert second == []
        assert {item.source_type for item in first} <= {
            "agent_ocr_required",
            "agent_compliance_check",
            "agent_response_gap",
        }
        ocr_task = next(item for item in first if item.source_type == "agent_ocr_required")
        assert ocr_task.source_id == document.id
        assert document.filename in ocr_task.title
        assert "第1页" in ocr_task.description
        assert ocr_task.priority == "high"
        assert all(item.source_id for item in first)
        assert all(item.status == "todo" for item in first)

        db.execute(
            delete(RemediationTask).where(
                RemediationTask.project_id == project_id,
                RemediationTask.source_type.in_(
                    ("agent_ocr_required", "agent_compliance_check", "agent_response_gap")
                ),
            )
        )
        page.layout_json = original_layout
        db.commit()
