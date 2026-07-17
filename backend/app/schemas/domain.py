from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class EvidenceCreate(BaseModel):
    document_id: UUID
    name: str = Field(min_length=2, max_length=300)
    evidence_type: str = Field(min_length=2, max_length=60)
    legal_entity: str = Field(min_length=2, max_length=300)
    effective_date: date | None = None
    expiry_date: date | None = None
    sensitivity: Literal["public", "internal", "legal", "finance", "confidential"] = "internal"
    tags: list[str] = Field(default_factory=list)


class EvidenceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=300)
    legal_entity: str | None = Field(default=None, min_length=2, max_length=300)
    effective_date: date | None = None
    expiry_date: date | None = None
    status: str | None = None
    sensitivity: str | None = None
    tags: list[str] | None = None
    reason: str = Field(min_length=3, max_length=2000)


class EvidenceRead(ORMModel):
    id: UUID
    organization_id: UUID
    name: str
    evidence_type: str
    legal_entity: str
    document_id: UUID
    effective_date: date | None
    expiry_date: date | None
    status: str
    sensitivity: str
    tags: list
    reviewed_at: datetime | None
    reviewed_by: UUID | None


class EvidenceClaimRead(ORMModel):
    id: UUID
    evidence_asset_id: UUID
    claim_type: str
    subject: str
    predicate: str
    value: str
    unit: str | None
    valid_from: date | None
    valid_to: date | None
    source_page: int
    source_text: str
    extraction_confidence: float
    human_verified: bool


class MatchDecision(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class ComplianceOverride(BaseModel):
    result: Literal["pass", "fail", "warning", "manual_review", "not_applicable"]
    reason: str = Field(min_length=3, max_length=2000)


class ConsistencyResolve(BaseModel):
    status: Literal["resolved", "accepted_difference"]
    resolution: str = Field(min_length=3, max_length=2000)


class AmendmentAnalyze(BaseModel):
    document_id: UUID


class TaskCreate(BaseModel):
    source_type: str = Field(min_length=2, max_length=60)
    source_id: UUID
    title: str = Field(min_length=2, max_length=300)
    description: str = Field(min_length=2)
    priority: Literal["fatal", "high", "medium", "low"] = "medium"
    assignee_id: UUID | None = None
    due_at: datetime | None = None
    reviewer_id: UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=300)
    description: str | None = Field(default=None, min_length=2)
    priority: str | None = None
    status: str | None = None
    assignee_id: UUID | None = None
    due_at: datetime | None = None
    reviewer_id: UUID | None = None
    reason: str = Field(min_length=3, max_length=2000)


class TaskDecision(BaseModel):
    note: str = Field(min_length=3, max_length=2000)


class PackageBuild(BaseModel):
    approved: bool = False
    approval_reason: str | None = Field(default=None, max_length=2000)


class PackageItemUpdate(BaseModel):
    document_id: UUID | None = None
    required: bool | None = None
    human_confirmed: bool = False
    reason: str = Field(min_length=3, max_length=2000)


class ResponseEdit(BaseModel):
    """A human edit that must be sent back through review before use."""

    edited_text: str = Field(min_length=1, max_length=50000)
    reason: str = Field(min_length=3, max_length=2000)


class ResponseItemRead(ORMModel):
    id: UUID
    project_id: UUID
    requirement_id: UUID
    model_run_id: UUID | None
    status: str
    response_strategy: str | None
    draft_text: str | None
    edited_text: str | None
    missing_information: list
    risk_notes: list
    confidence: float | None
    generation_version: int
    version: int
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    evidence_claim_ids: list[UUID] = Field(default_factory=list)
