from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete

from app.auth.dependencies import Principal
from app.db.session import SessionLocal
from app.models.entities import RemediationTask
from app.services.remediation import create_agent_remediation_tasks


def test_agent_remediation_tasks_are_source_bound_and_idempotent(demo) -> None:
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]),
        user_id=UUID(demo["user_id"]),
        role="admin",
    )
    project_id = UUID(demo["project_id"])
    with SessionLocal() as db:
        first = create_agent_remediation_tasks(db, principal, project_id)
        second = create_agent_remediation_tasks(db, principal, project_id)

        assert first
        assert second == []
        assert {item.source_type for item in first} <= {
            "agent_compliance_check",
            "agent_response_gap",
        }
        assert all(item.source_id for item in first)
        assert all(item.status == "todo" for item in first)

        db.execute(
            delete(RemediationTask).where(
                RemediationTask.project_id == project_id,
                RemediationTask.source_type.in_(
                    ("agent_compliance_check", "agent_response_gap")
                ),
            )
        )
        db.commit()
