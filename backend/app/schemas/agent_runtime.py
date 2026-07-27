"""P1 agent runtime boundary schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ORMModel

AgentRunStatus = Literal[
    "queued",
    "planning",
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "cancelled",
]
AgentRunMode = Literal["autonomous_draft", "supervised"]
AgentRunOutcome = Literal["success", "partial", "blocked", "no_result"]
AgentRunScope = Literal[
    "full_bid_draft",
    "risk_review",
    "material_gap_analysis",
    "response_improvement",
    "amendment_reanalysis",
    "work_package_check",
]
AgentStepStatus = Literal[
    "pending",
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "blocked",
    "cancelled",
]
ApprovalStatus = Literal["pending", "approved", "rejected", "cancelled"]

DEFAULT_WORKFLOW_TYPE = "bid_analysis_and_response_v1"


class AgentRunCreate(BaseModel):
    goal: str = Field(default="分析项目文档并生成内部投标草稿", min_length=3, max_length=4000)
    workflow_type: str = Field(default=DEFAULT_WORKFLOW_TYPE, min_length=3, max_length=100)
    input_revision: int = Field(default=1, ge=1)
    mode: AgentRunMode = "autonomous_draft"
    scope: AgentRunScope = "full_bid_draft"
    max_iterations: int = Field(default=20, ge=1, le=100)


class ApprovalDecision(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


# Kept as an import-compatible boundary name for callers created before P1 routing settled.
ApprovalDecisionRequest = ApprovalDecision


class AgentRunRead(ORMModel):
    id: UUID
    tenant_id: UUID
    project_id: UUID
    workflow_type: str
    goal: str
    mode: AgentRunMode
    scope: AgentRunScope
    outcome: AgentRunOutcome | None
    plan_json: dict
    iteration: int
    max_iterations: int
    current_action: str | None
    last_observation: str | None
    next_action: str | None
    agent_summary: str | None
    completion_reason: str | None
    status: AgentRunStatus
    current_step: str | None
    input_revision: int
    started_at: datetime | None
    completed_at: datetime | None
    cancel_requested: bool
    error_code: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    created_by: UUID
    version: int


class AgentStepRunRead(ORMModel):
    id: UUID
    tenant_id: UUID
    run_id: UUID
    step_key: str
    sequence: int
    status: AgentStepStatus
    attempt: int
    input_hash: str | None
    output_hash: str | None
    started_at: datetime | None
    completed_at: datetime | None
    error_code: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    created_by: UUID
    version: int


class AgentEventRead(ORMModel):
    id: UUID
    tenant_id: UUID
    run_id: UUID
    step_run_id: UUID
    event_type: str
    sequence: int
    payload: dict
    created_at: datetime


class ApprovalRequestRead(ORMModel):
    id: UUID
    tenant_id: UUID
    run_id: UUID
    step_run_id: UUID | None
    approval_type: str
    status: ApprovalStatus
    title: str
    description: str
    impact_summary: str | None
    reversible: bool
    requested_role: str
    decision_reason: str | None
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime
    created_by: UUID
    version: int


class AgentArtifactRead(ORMModel):
    # ORM stores the JSON document on attribute `metadata_json` (SQL column "metadata").
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    tenant_id: UUID
    run_id: UUID
    step_run_id: UUID | None
    artifact_type: str
    title: str
    storage_key: str
    content_hash: str
    metadata: dict = Field(default_factory=dict, validation_alias="metadata_json")
    created_at: datetime
    updated_at: datetime
    created_by: UUID
    version: int
