from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

ToolName = Literal[
    "inspect_project",
    "parse_pending_documents",
    "extract_project_profile",
    "extract_requirements",
    "classify_bid_risks",
    "extract_evidence_claims",
    "match_evidence",
    "run_compliance_checks",
    "generate_responses",
    "check_response_quality",
    "revise_responses",
    "create_remediation_tasks",
    "assemble_work_package",
    "finish_run",
]
ToolStatus = Literal["completed", "partial", "blocked", "failed"]
AgentScope = Literal[
    "full_bid_draft",
    "risk_review",
    "material_gap_analysis",
    "response_improvement",
    "amendment_reanalysis",
    "work_package_check",
]


class AgentContext(BaseModel):
    """Read-only facts used by the deterministic planner.

    Counts are rebuilt from persisted project state before every decision.  They
    are observations, not domain conclusions.
    """

    tenant_id: UUID
    project_id: UUID
    run_id: UUID
    mode: str
    scope: AgentScope
    goal: str
    document_count: int = 0
    tender_main_count: int = 0
    unparsed_document_count: int = 0
    ocr_required_count: int = 0
    requirement_count: int = 0
    provisional_requirement_count: int = 0
    manual_review_requirement_count: int = 0
    disqualification_candidate_count: int = 0
    evidence_asset_count: int = 0
    evidence_claim_count: int = 0
    unclaimed_evidence_asset_count: int = 0
    evidence_match_count: int = 0
    provisional_match_count: int = 0
    missing_evidence_requirement_count: int = 0
    compliance_check_count: int = 0
    compliance_fail_count: int = 0
    compliance_review_count: int = 0
    response_count: int = 0
    missing_response_count: int = 0
    missing_evidence_response_count: int = 0
    review_response_count: int = 0
    response_quality_issue_count: int = 0
    response_quality_artifact_count: int = 0
    remediation_task_count: int = 0
    project_profile_artifact_count: int = 0
    export_artifact_count: int = 0
    completed_tools: set[ToolName] = Field(default_factory=set)


class PlannerDecision(BaseModel):
    action: Literal["call_tool", "request_user", "finish"]
    tool: ToolName | None = None
    reason: str = Field(min_length=1, max_length=500)
    observation: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def requires_registered_tool_for_calls(self):
        if self.action == "call_tool" and self.tool is None:
            raise ValueError("call_tool decisions require a registered tool")
        if self.action == "request_user" and self.tool is not None:
            raise ValueError("request_user decisions cannot carry a tool")
        if self.action == "finish" and self.tool != "finish_run":
            raise ValueError("finish decisions must use finish_run")
        return self


class ToolResult(BaseModel):
    tool: ToolName
    status: ToolStatus
    summary: str = Field(min_length=1, max_length=1000)
    facts: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    recommended_next_tools: list[ToolName] = Field(default_factory=list)
    needs_user: bool = False
