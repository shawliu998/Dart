from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

from sqlalchemy import select

from app.autonomous_agent.context import build_agent_context
from app.db.session import SessionLocal
from app.models.entities import Requirement, ResponseEvidenceLink, ResponseItem
from app.services.responses import generate_project_responses


def test_superseded_requirement_is_hidden_from_current_views_and_response_generation(client, demo) -> None:
    """Historical rows remain auditable but never drive a new project workflow."""
    tenant_id = UUID(demo["tenant_id"])
    user_id = UUID(demo["user_id"])
    project_id = UUID(demo["project_id"])
    created_response_ids: set[UUID] = set()
    with SessionLocal() as db:
        template = db.scalar(
            select(Requirement).where(
                Requirement.project_id == project_id,
                Requirement.tenant_id == tenant_id,
                Requirement.is_current.is_(True),
            )
        )
        assert template is not None
        superseded = Requirement(
            tenant_id=tenant_id,
            created_by=user_id,
            project_id=project_id,
            requirement_code="HIST-TEST",
            category=template.category,
            title="历史版本测试条款",
            normalized_requirement="历史版本不应进入当前工作流",
            original_text="历史版本测试原文",
            original_hash=uuid4().hex,
            mandatory=False,
            disqualification_if_failed=False,
            risk_level="low",
            source_document_id=template.source_document_id,
            source_page=template.source_page,
            extraction_confidence=template.extraction_confidence,
            extraction_revision=999,
            is_current=False,
            review_status="manual_review",
            human_verified=False,
        )
        db.add(superseded)
        db.commit()
        superseded_id = superseded.id
        existing_response_ids = set(
            db.scalars(
                select(ResponseItem.id).where(
                    ResponseItem.project_id == project_id,
                    ResponseItem.tenant_id == tenant_id,
                )
            )
        )

        context = build_agent_context(
            db,
            SimpleNamespace(
                id=uuid4(),
                tenant_id=tenant_id,
                project_id=project_id,
                mode="autonomous_draft",
                scope="full_bid_draft",
                goal="测试当前条款过滤",
            ),
        )
        current_requirements = list(
            db.scalars(
                select(Requirement).where(
                    Requirement.project_id == project_id,
                    Requirement.tenant_id == tenant_id,
                    Requirement.is_current.is_(True),
                )
            )
        )
        assert context.requirement_count == len(current_requirements)

        generated = generate_project_responses(
            db,
            SimpleNamespace(tenant_id=tenant_id, user_id=user_id, role="admin"),
            project_id,
            allow_provisional=True,
        )
        assert superseded_id not in {item.requirement_id for item in generated}
        created_response_ids = set(
            db.scalars(
                select(ResponseItem.id).where(
                    ResponseItem.project_id == project_id,
                    ResponseItem.tenant_id == tenant_id,
                )
            )
        ) - existing_response_ids
        assert db.scalar(
            select(ResponseItem).where(ResponseItem.requirement_id == superseded_id)
        ) is None

        # Historical response rows remain available by ID for audit, but must not
        # leak back into the current project response list.
        db.add(
            ResponseItem(
                tenant_id=tenant_id,
                created_by=user_id,
                project_id=project_id,
                requirement_id=superseded_id,
                status="drafted",
                draft_text="历史版本响应",
            )
        )
        db.commit()
        historical_response_id = db.scalar(
            select(ResponseItem.id).where(ResponseItem.requirement_id == superseded_id)
        )
        assert historical_response_id is not None
        created_response_ids.add(historical_response_id)

    try:
        listed = client.get(
            f"/api/projects/{project_id}/requirements", headers=demo["auth_headers"]
        )
        assert listed.status_code == 200
        assert str(superseded_id) not in {item["id"] for item in listed.json()}

        responses = client.get(
            f"/api/projects/{project_id}/responses", headers=demo["auth_headers"]
        )
        assert responses.status_code == 200
        assert str(superseded_id) not in {
            item["requirement_id"] for item in responses.json()
        }
    finally:
        with SessionLocal() as db:
            if created_response_ids:
                db.query(ResponseEvidenceLink).filter(
                    ResponseEvidenceLink.response_item_id.in_(created_response_ids)
                ).delete(synchronize_session=False)
                db.query(ResponseItem).filter(
                    ResponseItem.id.in_(created_response_ids)
                ).delete(synchronize_session=False)
            db.query(Requirement).filter(Requirement.id == superseded_id).delete(
                synchronize_session=False
            )
            db.commit()
