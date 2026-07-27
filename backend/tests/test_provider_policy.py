from __future__ import annotations

import pytest

from app.agents.provider import (
    MockLLMProvider,
    OpenAICompatibleProvider,
    ProviderUnavailableError,
    get_requirement_provider,
)
from app.main import health


def test_mock_is_the_default_requirement_provider(monkeypatch) -> None:
    monkeypatch.delenv("BIDEVIDENCE_LLM_PROVIDER", raising=False)
    provider = get_requirement_provider()
    assert isinstance(provider, MockLLMProvider)
    assert provider.name == "mock"


def test_unapproved_provider_is_rejected_before_any_model_call(monkeypatch) -> None:
    monkeypatch.setenv("BIDEVIDENCE_LLM_PROVIDER", "kimi-k3")
    with pytest.raises(ProviderUnavailableError, match="not approved"):
        get_requirement_provider()


def test_health_reports_an_unapproved_provider_without_attempting_a_live_call(monkeypatch) -> None:
    monkeypatch.setenv("BIDEVIDENCE_LLM_PROVIDER", "kimi-k3")
    response = health()
    assert response["llm_provider"] == "kimi-k3"
    assert response["llm_provider_status"] == "unavailable"
    assert response["llm_model"] is None


def test_openai_compatible_provider_requires_explicit_complete_configuration(monkeypatch) -> None:
    monkeypatch.setenv("BIDEVIDENCE_LLM_PROVIDER", "openai_compatible")
    monkeypatch.delenv("BIDEVIDENCE_LLM_BASE_URL", raising=False)
    monkeypatch.delenv("BIDEVIDENCE_LLM_API_KEY", raising=False)
    monkeypatch.delenv("BIDEVIDENCE_LLM_MODEL", raising=False)
    with pytest.raises(ProviderUnavailableError, match="requires"):
        get_requirement_provider()


def test_openai_compatible_provider_is_constructed_without_a_network_call(monkeypatch) -> None:
    monkeypatch.setenv("BIDEVIDENCE_LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("BIDEVIDENCE_LLM_BASE_URL", "http://127.0.0.1:11434/v1")
    monkeypatch.setenv("BIDEVIDENCE_LLM_API_KEY", "test-key")
    monkeypatch.setenv("BIDEVIDENCE_LLM_MODEL", "deepseek-current-model-from-env")
    monkeypatch.setenv("BIDEVIDENCE_LLM_MAX_TOKENS", "2048")
    provider = get_requirement_provider()
    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider.model == "deepseek-current-model-from-env"
    assert provider.max_tokens == 2048


def test_openai_compatible_provider_rejects_invalid_max_tokens(monkeypatch) -> None:
    monkeypatch.setenv("BIDEVIDENCE_LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("BIDEVIDENCE_LLM_BASE_URL", "https://offline.invalid/v1")
    monkeypatch.setenv("BIDEVIDENCE_LLM_API_KEY", "test-key")
    monkeypatch.setenv("BIDEVIDENCE_LLM_MODEL", "model-from-env")
    monkeypatch.setenv("BIDEVIDENCE_LLM_MAX_TOKENS", "too-many")
    with pytest.raises(ProviderUnavailableError, match="must be an integer"):
        get_requirement_provider()
