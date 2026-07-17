"""Deterministic next-action planner for persisted draft runs."""

from __future__ import annotations

from collections.abc import Iterable

from app.autonomous_agent.schemas import PlannerDecision, ToolName

_ACTION_BY_STEP: dict[str, ToolName] = {
    "ingest_documents": "inspect_project",
    "parse_documents": "parse_pending_documents",
    "extract_project_profile": "extract_project_profile",
    "extract_requirements": "extract_requirements",
    "match_evidence": "match_evidence",
    "run_compliance_rules": "run_compliance_checks",
    "draft_responses": "generate_responses",
    "export_artifacts": "assemble_work_package",
}


def plan_next_action(steps: Iterable[object]) -> PlannerDecision:
    """Choose the first incomplete domain action from persisted step state.

    Review-only steps are automatically represented as provisional progress in autonomous
    draft mode; they are never selected as a tool action.
    """
    for step in steps:
        key = getattr(step, "step_key")
        if getattr(step, "status") != "completed" and key in _ACTION_BY_STEP:
            action = _ACTION_BY_STEP[key]
            return PlannerDecision(action="call_tool", tool=action, reason=f"{key} 尚未完成")
    return PlannerDecision(action="finish", tool="finish_run", reason="工作包已生成，等待最终人工复核")
