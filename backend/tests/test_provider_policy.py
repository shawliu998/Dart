from __future__ import annotations

import pytest

from app.agents.provider import MockLLMProvider, ProviderUnavailableError, get_requirement_provider
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
