from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_desktop_mode_requires_per_launch_bearer_and_bootstraps_workspace(monkeypatch, tmp_path):
    tenant_id, user_id = uuid4(), uuid4()
    token = "desktop-test-token-" + "x" * 48
    monkeypatch.setenv("BIDEVIDENCE_DESKTOP_MODE", "1")
    monkeypatch.setenv("BIDEVIDENCE_DESKTOP_TOKEN", token)
    monkeypatch.setenv("BIDEVIDENCE_LOCAL_TENANT_ID", str(tenant_id))
    monkeypatch.setenv("BIDEVIDENCE_LOCAL_USER_ID", str(user_id))
    monkeypatch.setenv("BIDEVIDENCE_APP_DATA_DIR", str(tmp_path))

    with TestClient(app) as client:
        assert client.get("/health").json()["mode"] == "desktop"
        assert client.get("/api/projects").status_code == 401
        assert client.get(
            "/api/projects",
            headers={
                "X-Tenant-ID": str(tenant_id),
                "X-User-ID": str(user_id),
                "X-Role": "admin",
            },
        ).status_code == 401
        response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json()["id"] == str(user_id)
        created = client.post(
            "/api/projects",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "本地真实项目", "project_code": "LOCAL-001", "buyer_name": "本地采购人"},
        )
        assert created.status_code == 201
    assert (tmp_path / "documents").is_dir()
    assert (tmp_path / "exports").is_dir()
