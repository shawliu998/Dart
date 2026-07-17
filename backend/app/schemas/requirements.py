from __future__ import annotations

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import BoundingBox, ORMModel


RequirementCategory = Literal[
    "qualification",
    "commercial",
    "technical",
    "pricing",
    "delivery",
    "service",
    "personnel",
    "case",
    "legal",
    "security",
    "format",
    "signature",
    "submission",
    "other",
]


class RequirementExtractionResult(BaseModel):
    requirement_code: str | None = None
    category: RequirementCategory
    title: str = Field(min_length=2, max_length=300)
    normalized_requirement: str = Field(min_length=2)
    original_text: str = Field(min_length=2)
    mandatory: bool
    disqualification_if_failed: bool
    expected_evidence_types: list[str] = Field(default_factory=list)
    clause_number: str | None = None
    source_page: int = Field(ge=1)
    source_bbox: BoundingBox | None = None
    confidence: float = Field(ge=0, le=1)
    prompt_version: str = Field(min_length=1)
    manual_review_reason: str | None = None

    @model_validator(mode="after")
    def low_confidence_is_reviewed(self):
        if self.confidence < 0.70 and not self.manual_review_reason:
            raise ValueError("confidence below 0.70 requires manual_review_reason")
        return self


class RequirementBatch(BaseModel):
    results: list[RequirementExtractionResult]


class RequirementRead(ORMModel):
    id: UUID
    project_id: UUID
    requirement_code: str | None
    category: str
    title: str
    normalized_requirement: str
    original_text: str
    mandatory: bool
    disqualification_if_failed: bool
    risk_level: str
    source_document_id: UUID
    source_page: int
    source_bbox: dict | None
    clause_number: str | None
    extraction_confidence: Decimal
    review_status: str
    human_verified: bool
    review_reason: str | None


class RequirementVerify(BaseModel):
    decision: Literal["verify", "reject"]
    reason: str = Field(min_length=3, max_length=2000)


class RequirementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=300)
    normalized_requirement: str | None = Field(default=None, min_length=2)
    category: RequirementCategory | None = None
    mandatory: bool | None = None
    disqualification_if_failed: bool | None = None
    reason: str = Field(min_length=3, max_length=2000)

    @model_validator(mode="after")
    def requires_a_change(self):
        if not (self.model_fields_set - {"reason"}):
            raise ValueError("at least one requirement field must be changed")
        return self


class DisqualificationRead(ORMModel):
    id: UUID
    requirement_id: UUID
    trigger_type: str
    trigger_description: str
    severity: str
    detected_keywords: list
    deterministic_rule: str
    decision: str
    human_confirmed: bool | None
    decision_reason: str | None
