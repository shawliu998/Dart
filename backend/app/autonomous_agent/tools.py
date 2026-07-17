"""Closed tool registry.

The runtime binds these names to existing service calls.  Keeping registration separate makes
the planner incapable of requesting arbitrary code or document-instruction execution.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.autonomous_agent.schemas import AgentScope, ToolName


@dataclass(frozen=True)
class RegisteredTool:
    name: ToolName
    description: str
    step_key: str | None
    scopes: frozenset[AgentScope]


ALL_SCOPES: frozenset[AgentScope] = frozenset(
    {
        "full_bid_draft",
        "risk_review",
        "material_gap_analysis",
        "response_improvement",
        "amendment_reanalysis",
        "work_package_check",
    }
)


def _tool(
    name: ToolName,
    description: str,
    step_key: str | None,
    scopes: frozenset[AgentScope] = ALL_SCOPES,
) -> RegisteredTool:
    return RegisteredTool(name=name, description=description, step_key=step_key, scopes=scopes)

TOOL_REGISTRY: dict[ToolName, RegisteredTool] = {
    "inspect_project": _tool("inspect_project", "Create the document inventory.", "ingest_documents"),
    "parse_pending_documents": _tool("parse_pending_documents", "Parse pending project documents.", "parse_documents", frozenset({"full_bid_draft", "risk_review", "material_gap_analysis", "amendment_reanalysis"})),
    "extract_project_profile": _tool("extract_project_profile", "Create a source-bound project profile artifact.", "extract_project_profile", frozenset({"full_bid_draft", "risk_review", "amendment_reanalysis"})),
    "extract_requirements": _tool("extract_requirements", "Run requirement extraction.", "extract_requirements", frozenset({"full_bid_draft", "risk_review", "material_gap_analysis", "amendment_reanalysis"})),
    "classify_bid_risks": _tool("classify_bid_risks", "Classify deterministic risk candidates.", None, frozenset({"risk_review", "full_bid_draft"})),
    "extract_evidence_claims": _tool("extract_evidence_claims", "Extract source-bound evidence claims.", None, frozenset({"full_bid_draft", "material_gap_analysis", "amendment_reanalysis"})),
    "match_evidence": _tool("match_evidence", "Run the existing deterministic evidence matcher.", "match_evidence", frozenset({"full_bid_draft", "material_gap_analysis", "amendment_reanalysis"})),
    "run_compliance_checks": _tool("run_compliance_checks", "Run deterministic compliance services.", "run_compliance_rules", frozenset({"full_bid_draft", "risk_review", "material_gap_analysis", "amendment_reanalysis", "work_package_check"})),
    "generate_responses": _tool("generate_responses", "Generate internal response drafts.", "draft_responses", frozenset({"full_bid_draft", "response_improvement", "amendment_reanalysis"})),
    "check_response_quality": _tool("check_response_quality", "Run deterministic response quality checks.", None, frozenset({"full_bid_draft", "response_improvement", "amendment_reanalysis", "work_package_check"})),
    "revise_responses": _tool("revise_responses", "Apply safe draft-only response repairs.", None, frozenset({"full_bid_draft", "response_improvement", "amendment_reanalysis"})),
    "create_remediation_tasks": _tool("create_remediation_tasks", "Create project remediation tasks.", None, frozenset({"risk_review", "material_gap_analysis"})),
    "assemble_work_package": _tool("assemble_work_package", "Export the existing project artifact package.", "export_artifacts", frozenset({"full_bid_draft", "response_improvement", "amendment_reanalysis", "work_package_check"})),
    "finish_run": _tool("finish_run", "Finish or request the final work-package review.", None),
}
