from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=300)
    project_code: str = Field(min_length=2, max_length=100)
    buyer_name: str = Field(min_length=2, max_length=300)
    budget_amount: Decimal | None = Field(default=None, ge=0)
    currency: str = Field(default="CNY", pattern=r"^[A-Z]{3}$")
    deadline: datetime | None = None
    owner_id: UUID | None = None

    @field_validator("deadline")
    @classmethod
    def deadline_has_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("deadline must include timezone")
        return value


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=300)
    buyer_name: str | None = Field(default=None, min_length=2, max_length=300)
    budget_amount: Decimal | None = Field(default=None, ge=0)
    deadline: datetime | None = None
    status: str | None = None
    current_stage: str | None = None
    owner_id: UUID | None = None


class ProjectRead(ORMModel):
    id: UUID
    tenant_id: UUID
    organization_id: UUID
    name: str
    project_code: str
    buyer_name: str
    budget_amount: Decimal | None
    currency: str
    deadline: datetime | None
    status: str
    current_stage: str
    risk_level: str
    completion_percentage: int
    owner_id: UUID | None
    created_at: datetime
    updated_at: datetime
