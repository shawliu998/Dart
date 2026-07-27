from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from app.audit.service import append_event
from app.auth.dependencies import Principal
from app.db.session import SessionLocal


def _uuid_from_header(response) -> UUID:
    return UUID(response.headers["X-Request-ID"])


def _create_project(client, headers: dict[str, str], suffix: str) -> tuple[str, UUID]:
    response = client.post(
        "/api/projects",
        headers=headers,
        json={"name": f"请求审计项目{suffix}", "project_code": f"RID-{suffix}", "buyer_name": "审计采购人"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"], _uuid_from_header(response)


def test_http_audit_event_uses_response_request_id_and_ignores_client_value(client, demo) -> None:
    project_id, response_id = _create_project(
        client,
        {**demo["auth_headers"], "X-Request-ID": "00000000-0000-0000-0000-000000000000"},
        "one",
    )
    assert str(response_id) != "00000000-0000-0000-0000-000000000000"

    events = client.get(f"/api/projects/{project_id}/audit", headers=demo["auth_headers"])
    assert events.status_code == 200
    created = next(event for event in events.json() if event["action"] == "project.created")
    assert UUID(created["request_id"]) == response_id


def test_request_ids_are_distinct_and_exposed_to_browser(client) -> None:
    first = client.get("/health", headers={"Origin": "http://localhost:3000"})
    second = client.get("/health", headers={"Origin": "http://localhost:3000"})

    first_id = _uuid_from_header(first)
    second_id = _uuid_from_header(second)
    assert first_id != second_id
    assert first.headers["access-control-expose-headers"] == "X-Request-ID"


def test_non_http_audit_writes_receive_distinct_request_ids(demo) -> None:
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]), user_id=UUID(demo["user_id"]), role="admin"
    )
    with SessionLocal() as db:
        first = append_event(
            db, principal, action="test.detached", entity_type="test", entity_id=uuid4(), project_id=None
        )
        second = append_event(
            db, principal, action="test.detached", entity_type="test", entity_id=uuid4(), project_id=None
        )
        db.commit()
        assert isinstance(first.request_id, UUID)
        assert isinstance(second.request_id, UUID)
        assert first.request_id != second.request_id


def test_background_audit_is_detached_from_enqueue_request(client, demo) -> None:
    project_id, _ = _create_project(client, demo["auth_headers"], "background")
    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    with pdf_path.open("rb") as pdf:
        uploaded = client.post(
            f"/api/projects/{project_id}/documents",
            headers=demo["auth_headers"],
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    document_id = uploaded.json()["id"]
    queued = client.post(f"/api/documents/{document_id}/parse", headers=demo["auth_headers"])
    assert queued.status_code == 202
    enqueue_id = _uuid_from_header(queued)

    events = client.get(f"/api/projects/{project_id}/audit", headers=demo["auth_headers"]).json()
    parsed = next(event for event in events if event["action"] == "document.parsed")
    assert UUID(parsed["request_id"]) != enqueue_id
