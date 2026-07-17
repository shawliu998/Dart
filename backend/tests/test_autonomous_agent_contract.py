from __future__ import annotations

import pytest
from pydantic import ValidationError

from uuid import UUID

from app.autonomous_agent import AgentContext, TOOL_REGISTRY, PlannerDecision, ToolResult, next_decision


def _context(**changes) -> AgentContext:
    values = {
        "tenant_id": UUID("00000000-0000-0000-0000-000000000001"),
        "project_id": UUID("00000000-0000-0000-0000-000000000010"),
        "run_id": UUID("00000000-0000-0000-0000-000000000020"),
        "mode": "autonomous_draft",
        "scope": "full_bid_draft",
        "goal": "生成内部草稿",
    }
    values.update(changes)
    return AgentContext(**values)


def test_planner_selects_only_registered_tool() -> None:
    decision = next_decision(_context())
    assert decision.action == "call_tool"
    assert decision.tool == "inspect_project"
    assert decision.tool in TOOL_REGISTRY
    assert TOOL_REGISTRY[decision.tool].step_key == "ingest_documents"


def test_planner_uses_fresh_counts_and_scope() -> None:
    risk_context = _context(
        scope="risk_review",
        document_count=2,
        tender_main_count=1,
        completed_tools={"inspect_project"},
        requirement_count=4,
        project_profile_artifact_count=1,
    )
    decision = next_decision(risk_context)
    assert decision.tool == "run_compliance_checks"
    assert "generate_responses" not in {
        tool.name for tool in TOOL_REGISTRY.values() if risk_context.scope in tool.scopes
    }


def test_planner_skips_satisfied_actions_and_finishes() -> None:
    decision = next_decision(
        _context(
            document_count=1,
            tender_main_count=1,
            requirement_count=1,
            evidence_match_count=1,
            compliance_check_count=1,
            response_count=1,
            response_quality_artifact_count=1,
            project_profile_artifact_count=1,
            export_artifact_count=3,
            completed_tools={
                "inspect_project",
                "match_evidence",
                "run_compliance_checks",
                "generate_responses",
            },
        )
    )
    assert decision.action == "finish"
    assert decision.tool == "finish_run"


def test_tool_result_contract_requires_explicit_status_and_safe_fields() -> None:
    result = ToolResult(tool="inspect_project", status="partial", summary="部分文件可用")
    assert result.facts == {}
    assert result.warnings == []
    assert result.artifacts == []
    assert result.recommended_next_tools == []
    assert result.needs_user is False
    with pytest.raises(ValidationError):
        ToolResult(tool="inspect_project", status="skipped", summary="not valid")


def test_planner_decision_rejects_unregistered_tool_name() -> None:
    with pytest.raises(ValidationError):
        PlannerDecision(action="call_tool", tool="shell", reason="not allowed")
    with pytest.raises(ValidationError):
        PlannerDecision(action="call_tool", reason="missing tool")
