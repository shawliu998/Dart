from __future__ import annotations

from uuid import UUID, uuid4

from app.autonomous_agent import build_agent_context
from app.db.session import SessionLocal
from app.models.entities import AgentArtifact, AgentEvent, AgentRun


def test_context_is_rebuilt_from_tenant_scoped_project_state(demo) -> None:
    tenant_id = UUID(demo["tenant_id"])
    user_id = UUID(demo["user_id"])
    project_id = UUID(demo["project_id"])
    with SessionLocal() as db:
        run = AgentRun(
            id=uuid4(),
            tenant_id=tenant_id,
            project_id=project_id,
            workflow_type="bid_analysis_and_response_v1",
            goal="聚合当前项目状态",
            mode="autonomous_draft",
            scope="material_gap_analysis",
            status="completed",
            created_by=user_id,
        )
        db.add(run)
        db.flush()
        db.add_all(
            [
                AgentEvent(
                    tenant_id=tenant_id,
                    run_id=run.id,
                    event_type="tool.completed",
                    sequence=1,
                    payload={"tool": "inspect_project"},
                ),
                AgentArtifact(
                    tenant_id=tenant_id,
                    run_id=run.id,
                    artifact_type="project_profile",
                    title="项目摘要",
                    storage_key=f"runtime://{run.id}/profile",
                    content_hash="a" * 64,
                    metadata_json={},
                    created_by=user_id,
                ),
            ]
        )
        db.flush()

        context = build_agent_context(db, run)

        assert context.document_count == demo["documents"]
        assert context.requirement_count == demo["requirements"]
        assert context.evidence_asset_count == demo["evidence_assets"]
        assert context.evidence_claim_count == demo["claims"]
        assert context.evidence_match_count == demo["matches"]
        assert context.compliance_check_count == demo["checks"]
        assert context.remediation_task_count == demo["tasks"]
        assert context.project_profile_artifact_count == 1
        assert context.completed_tools == {"inspect_project"}
        db.rollback()
