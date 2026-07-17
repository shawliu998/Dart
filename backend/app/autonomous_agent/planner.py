"""Deterministic next-action planner for persisted draft runs."""

from __future__ import annotations

from collections.abc import Callable

from app.autonomous_agent.schemas import AgentContext, PlannerDecision, ToolName
from app.autonomous_agent.tools import TOOL_REGISTRY


def _needed(context: AgentContext) -> list[tuple[ToolName, Callable[[AgentContext], bool], str]]:
    return [
        ("inspect_project", lambda value: "inspect_project" not in value.completed_tools, "需要建立项目文件清单"),
        ("parse_pending_documents", lambda value: value.unparsed_document_count > 0, "存在未完成解析的文件"),
        ("extract_project_profile", lambda value: value.project_profile_artifact_count == 0, "尚未生成有来源的项目摘要"),
        ("extract_requirements", lambda value: value.requirement_count == 0, "尚未抽取招标要求"),
        ("extract_evidence_claims", lambda value: value.unclaimed_evidence_asset_count > 0, "存在尚未抽取结构化 Claim 的企业材料"),
        ("match_evidence", lambda value: value.requirement_count > 0 and "match_evidence" not in value.completed_tools, "要求尚未完成本次证据匹配"),
        ("run_compliance_checks", lambda value: value.compliance_check_count == 0 or "run_compliance_checks" not in value.completed_tools, "需要根据当前证据重算合规检查"),
        ("generate_responses", lambda value: value.requirement_count > 0 and (value.missing_response_count > 0 or "generate_responses" not in value.completed_tools), "存在未生成内部草稿的要求"),
        ("assemble_work_package", lambda value: value.export_artifact_count == 0, "尚未生成本次交付工作包"),
    ]


def plan_next_action(context: AgentContext) -> PlannerDecision:
    """Choose a bounded action from fresh project facts and the selected scope."""
    for tool_name, predicate, reason in _needed(context):
        tool = TOOL_REGISTRY[tool_name]
        if context.scope in tool.scopes and predicate(context):
            return PlannerDecision(
                action="call_tool",
                tool=tool_name,
                reason=reason,
                observation=(
                    f"文件 {context.document_count}，要求 {context.requirement_count}，"
                    f"证据匹配 {context.evidence_match_count}，响应 {context.response_count}"
                ),
            )
    return PlannerDecision(
        action="finish",
        tool="finish_run",
        reason="所选分析范围内已无待执行动作",
    )
