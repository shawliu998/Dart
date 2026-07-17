from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.autonomous_agent import TOOL_REGISTRY, PlannerDecision, ToolResult, next_decision


class _Step:
    def __init__(self, step_key: str, status: str) -> None:
        self.step_key = step_key
        self.status = status


def test_planner_selects_only_registered_tool() -> None:
    decision = next_decision([_Step("ingest_documents", "pending")])
    assert decision.action == "call_tool"
    assert decision.tool == "inspect_project"
    assert decision.tool in TOOL_REGISTRY


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
