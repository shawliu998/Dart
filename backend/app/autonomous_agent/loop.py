from __future__ import annotations

from collections.abc import Iterable

from app.autonomous_agent.planner import plan_next_action
from app.autonomous_agent.schemas import PlannerDecision
from app.autonomous_agent.tools import TOOL_REGISTRY


def next_decision(steps: Iterable[object]) -> PlannerDecision:
    """Return a schema-validated decision constrained to the closed registry."""
    decision = plan_next_action(steps)
    if decision.tool is not None and decision.tool not in TOOL_REGISTRY:
        raise ValueError(f"unregistered autonomous tool: {decision.tool}")
    return decision
