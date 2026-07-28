from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


ProviderName = Literal["mock", "deepseek"]


class AISettingsRead(BaseModel):
    provider: ProviderName
    base_url: str | None
    model: str | None
    has_api_key: bool
    capability_profile: dict
    last_test_status: Literal["untested", "passed", "failed"]
    last_tested_at: datetime | None
    last_error_code: str | None


class AISettingsWrite(BaseModel):
    provider: ProviderName
    base_url: str | None = Field(default=None, max_length=500)
    model: str | None = Field(default=None, max_length=150)
    api_key: str | None = Field(default=None, min_length=8, max_length=1000)
    clear_api_key: bool = False

    @model_validator(mode="after")
    def validate_provider_fields(self):
        if self.provider == "deepseek" and (
            not (self.base_url or "").strip() or not (self.model or "").strip()
        ):
            raise ValueError("DeepSeek requires a base URL and model")
        if self.api_key is not None and self.clear_api_key:
            raise ValueError("api_key and clear_api_key cannot be used together")
        return self


class AIConnectionTest(AISettingsWrite):
    pass


class AIConnectionTestResult(BaseModel):
    status: Literal["passed", "failed"]
    provider: ProviderName
    model: str
    error_code: str | None = None
