from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.provider import (
    MockLLMProvider,
    OpenAICompatibleProvider,
    ProviderUnavailableError,
)
from app.auth.dependencies import Principal
from app.core.secrets import SecretStore, get_secret_store
from app.models.entities import WorkspaceAISettings
from app.schemas.settings import (
    AIConnectionTest,
    AIConnectionTestResult,
    AISettingsRead,
    AISettingsWrite,
)
from pydantic import BaseModel


DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash"
DEEPSEEK_PROFILE = {
    "adapter": "openai_compatible",
    "json_object": True,
    "temperature": 0,
}
MOCK_PROFILE = {
    "adapter": "mock",
    "json_object": True,
    "offline": True,
}


class _ConnectionProbe(BaseModel):
    ok: bool


def _row(db: Session, tenant_id):
    return db.scalar(
        select(WorkspaceAISettings).where(
            WorkspaceAISettings.tenant_id == tenant_id
        )
    )


def _secret_ref(tenant_id) -> str:
    return f"workspace/{tenant_id}/ai/deepseek"


def _fingerprint(
    data: AISettingsWrite | AIConnectionTest,
    api_key: str | None,
) -> str:
    normalized = "|".join(
        (
            data.provider,
            (data.base_url or "").strip().rstrip("/"),
            (data.model or "").strip(),
            hashlib.sha256((api_key or "").encode()).hexdigest(),
        )
    )
    return hashlib.sha256(normalized.encode()).hexdigest()


def read_settings(
    db: Session,
    principal: Principal,
    *,
    secret_store: SecretStore | None = None,
) -> AISettingsRead:
    row = _row(db, principal.tenant_id)
    if row is None:
        return AISettingsRead(
            provider="mock",
            base_url=DEEPSEEK_DEFAULT_BASE_URL,
            model=DEEPSEEK_DEFAULT_MODEL,
            has_api_key=False,
            capability_profile=MOCK_PROFILE,
            last_test_status="untested",
            last_tested_at=None,
            last_error_code=None,
        )
    store = secret_store or get_secret_store()
    return AISettingsRead(
        provider=row.provider,
        base_url=row.base_url,
        model=row.model,
        has_api_key=bool(row.secret_ref and store.get(row.secret_ref)),
        capability_profile=row.capability_profile,
        last_test_status=row.last_test_status,
        last_tested_at=row.last_tested_at,
        last_error_code=row.last_error_code,
    )


def save_settings(
    db: Session,
    principal: Principal,
    data: AISettingsWrite,
    *,
    secret_store: SecretStore | None = None,
) -> AISettingsRead:
    store = secret_store or get_secret_store()
    row = _row(db, principal.tenant_id)
    if row is None:
        row = WorkspaceAISettings(
            id=uuid4(),
            tenant_id=principal.tenant_id,
            created_by=principal.user_id,
            version=1,
        )
        db.add(row)
    reference = row.secret_ref or _secret_ref(principal.tenant_id)
    if data.api_key is not None:
        store.put(reference, data.api_key)
        row.secret_ref = reference
    elif data.clear_api_key:
        store.delete(reference)
        row.secret_ref = None
    if data.provider == "deepseek" and not (
        data.api_key or (row.secret_ref and store.get(row.secret_ref))
    ):
        raise ValueError("DeepSeek requires an API key")
    active_secret = store.get(row.secret_ref) if row.secret_ref else None
    tested = (
        row.last_test_status == "passed"
        and row.last_test_fingerprint == _fingerprint(data, active_secret)
    )
    row.provider = data.provider
    row.base_url = (
        (data.base_url or DEEPSEEK_DEFAULT_BASE_URL).rstrip("/")
        if data.provider == "deepseek"
        else data.base_url or DEEPSEEK_DEFAULT_BASE_URL
    )
    row.model = data.model or DEEPSEEK_DEFAULT_MODEL
    row.capability_profile = (
        DEEPSEEK_PROFILE if data.provider == "deepseek" else MOCK_PROFILE
    )
    if not tested:
        row.last_test_status = "untested"
        row.last_tested_at = None
        row.last_error_code = None
        row.last_test_fingerprint = None
    if row.id is not None and row.version is not None:
        row.version += 1
    db.commit()
    db.refresh(row)
    return read_settings(db, principal, secret_store=store)


def build_provider(
    data: AISettingsWrite | AIConnectionTest,
    *,
    existing_secret: str | None = None,
):
    if data.provider == "mock":
        return MockLLMProvider()
    api_key = data.api_key or existing_secret
    if not api_key:
        raise ProviderUnavailableError("DeepSeek requires an API key")
    return OpenAICompatibleProvider(
        base_url=(data.base_url or DEEPSEEK_DEFAULT_BASE_URL).rstrip("/"),
        api_key=api_key,
        model=data.model or DEEPSEEK_DEFAULT_MODEL,
        provider_name="deepseek",
        temperature=0,
        use_json_object=True,
    )


async def test_connection(
    db: Session,
    principal: Principal,
    data: AIConnectionTest,
    *,
    secret_store: SecretStore | None = None,
) -> AIConnectionTestResult:
    store = secret_store or get_secret_store()
    row = _row(db, principal.tenant_id)
    existing = store.get(row.secret_ref) if row and row.secret_ref else None
    active_secret = data.api_key or existing
    provider = None
    status: Literal["passed", "failed"]
    try:
        provider = build_provider(data, existing_secret=existing)
        if data.provider != "mock":
            result = await provider.structured_generate(
                system_prompt="Return one JSON object matching the requested schema.",
                user_input='Return exactly {"ok": true}.',
                output_schema=_ConnectionProbe,
                metadata={"prompt_version": "provider-probe-v1"},
            )
            if result.ok is not True:
                raise ProviderUnavailableError("provider probe returned an invalid result")
        status, error_code = "passed", None
    except ProviderUnavailableError as exc:
        status, error_code = "failed", _classify_error(str(exc))
    if row is None:
        row = WorkspaceAISettings(
            id=uuid4(),
            tenant_id=principal.tenant_id,
            created_by=principal.user_id,
            version=1,
            provider="mock",
            base_url=data.base_url or DEEPSEEK_DEFAULT_BASE_URL,
            model=data.model or DEEPSEEK_DEFAULT_MODEL,
            capability_profile=MOCK_PROFILE,
        )
        db.add(row)
    row.last_test_status = status
    row.last_tested_at = datetime.now(timezone.utc)
    row.last_error_code = error_code
    row.last_test_fingerprint = (
        _fingerprint(data, active_secret) if status == "passed" else None
    )
    db.commit()
    return AIConnectionTestResult(
        status=status,
        provider=data.provider,
        model=provider.model if provider else (data.model or DEEPSEEK_DEFAULT_MODEL),
        error_code=error_code,
    )


def _classify_error(message: str) -> str:
    lowered = message.lower()
    if "requires an api key" in lowered or "api key is unavailable" in lowered:
        return "missing_api_key"
    if "401" in lowered or "403" in lowered:
        return "authentication_failed"
    if "json" in lowered or "schema" in lowered or "validation" in lowered:
        return "structured_output_failed"
    if "timeout" in lowered:
        return "timeout"
    return "connection_failed"
