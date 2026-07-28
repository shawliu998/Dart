from __future__ import annotations

from uuid import UUID

from app.agents.provider import MockLLMProvider, OpenAICompatibleProvider
from app.db.session import SessionLocal
from app.agents.provider import get_requirement_provider


TENANT_ONE = "00000000-0000-0000-0000-000000000001"
TENANT_TWO = "00000000-0000-0000-0000-000000000101"
USER_ONE = "00000000-0000-0000-0000-000000000002"


def headers(tenant_id: str = TENANT_ONE) -> dict[str, str]:
    return {
        "X-Tenant-ID": tenant_id,
        "X-User-ID": USER_ONE,
        "X-Role": "admin",
    }


def test_ai_settings_default_to_explicit_mock(client) -> None:
    response = client.get("/api/settings/ai-model", headers=headers())
    assert response.status_code == 200
    assert response.json() == {
        "provider": "mock",
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-v4-flash",
        "has_api_key": False,
        "capability_profile": {
            "adapter": "mock",
            "json_object": True,
            "offline": True,
        },
        "last_test_status": "untested",
        "last_tested_at": None,
        "last_error_code": None,
    }


def test_saved_secret_is_not_returned_and_is_tenant_scoped(
    client,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv(
        "BIDEVIDENCE_SECRET_STORE_PATH",
        str(tmp_path / "provider-secrets.json"),
    )
    secret = "sk-private-deepseek-key"
    response = client.patch(
        "/api/settings/ai-model",
        headers=headers(),
        json={
            "provider": "deepseek",
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-v4-flash",
            "api_key": secret,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "deepseek"
    assert body["has_api_key"] is True
    assert secret not in response.text

    other = client.get("/api/settings/ai-model", headers=headers(TENANT_TWO))
    assert other.status_code == 200
    assert other.json()["provider"] == "mock"
    assert other.json()["has_api_key"] is False

    with SessionLocal() as db:
        provider = get_requirement_provider(
            db=db,
            tenant_id=UUID(TENANT_ONE),
        )
        assert isinstance(provider, OpenAICompatibleProvider)
        assert provider.name == "deepseek"
        assert provider.model == "deepseek-v4-flash"


def test_mock_test_save_and_runtime_switch_need_no_restart(client) -> None:
    tested = client.post(
        "/api/settings/ai-model/test",
        headers=headers(),
        json={"provider": "mock"},
    )
    assert tested.status_code == 200
    assert tested.json()["status"] == "passed"

    saved = client.patch(
        "/api/settings/ai-model",
        headers=headers(),
        json={"provider": "mock"},
    )
    assert saved.status_code == 200
    assert saved.json()["last_test_status"] == "passed"

    with SessionLocal() as db:
        provider = get_requirement_provider(
            db=db,
            tenant_id=UUID(TENANT_ONE),
        )
        assert isinstance(provider, MockLLMProvider)


def test_deepseek_connection_test_requires_key(client) -> None:
    response = client.post(
        "/api/settings/ai-model/test",
        headers=headers(),
        json={
            "provider": "deepseek",
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-v4-flash",
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "missing_api_key"
