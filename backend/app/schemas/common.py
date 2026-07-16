from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class BoundingBox(BaseModel):
    x0: float = Field(ge=0)
    y0: float = Field(ge=0)
    x1: float = Field(ge=0)
    y1: float = Field(ge=0)


class JobRead(ORMModel):
    id: UUID
    job_type: str
    entity_id: UUID
    status: str
    progress: int
    current_step: str
    error: str | None
    retryable: bool
    created_at: datetime


class DecisionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)
