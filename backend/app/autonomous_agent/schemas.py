from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

ToolName = Literal[
    "inspect_project",
    "parse_pending_documents",
    "extract_project_profile",
    "extract_requirements",
    "match_evidence",
    "run_compliance_checks",
    "generate_responses",
    "assemble_work_package",
    "finish_run",
]
ToolStatus = Literal["completed", "partial", "blocked", "failed"]


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
