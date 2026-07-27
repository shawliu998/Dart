from __future__ import annotations

from app.autonomous_agent.planner import plan_next_action
from app.autonomous_agent.schemas import AgentContext, PlannerDecision
from app.autonomous_agent.tools import TOOL_REGISTRY


def next_decision(context: AgentContext) -> PlannerDecision:
    """Return a schema-validated decision constrained to the closed registry."""
    decision = plan_next_action(context)
    if decision.tool is not None and decision.tool not in TOOL_REGISTRY:
        raise ValueError(f"unregistered autonomous tool: {decision.tool}")
    return decision
