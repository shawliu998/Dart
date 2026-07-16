from pathlib import Path
from uuid import uuid4


def test_cors_is_explicit_and_supports_frontend_headers(client):
    response = client.options(
        "/api/projects",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-tenant-id,x-user-id,x-role",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers.get("access-control-allow-credentials") is None

    denied = client.options(
        "/api/projects",
        headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "GET"},
    )
    assert denied.status_code == 400


def test_project_crud_rbac_and_tenant_isolation(client, demo):
    headers = demo["auth_headers"]
    created = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "测试采购项目",
            "project_code": "TEST-001",
            "buyer_name": "测试采购人",
            "budget_amount": "1000",
            "deadline": "2026-12-01T08:00:00+08:00",
        },
    )
    assert created.status_code == 201
    project_id = created.json()["id"]
    updated = client.patch(
        f"/api/projects/{project_id}", headers=headers, json={"name": "测试采购项目（更新）"}
    )
    assert updated.status_code == 200 and updated.json()["name"].endswith("（更新）")
    other = {**headers, "X-Tenant-ID": str(uuid4())}
    assert client.get(f"/api/projects/{project_id}", headers=other).status_code == 404
    viewer = {**headers, "X-Role": "viewer"}
    assert (
        client.patch(
            f"/api/projects/{project_id}", headers=viewer, json={"name": "越权"}
        ).status_code
        == 403
    )
    assert client.delete(f"/api/projects/{project_id}", headers=headers).status_code == 204
    assert client.get(f"/api/projects/{project_id}", headers=headers).status_code == 404


def test_real_demo_pdf_upload_parse_extract_review_and_audit(client, demo):
    headers = demo["auth_headers"]
    project_id = demo["project_id"]
    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    assert pdf_path.exists(), "deterministic demo PDF must exist"
    with pdf_path.open("rb") as handle:
        uploaded = client.post(
            f"/api/projects/{project_id}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, handle, "application/pdf")},
        )
    assert uploaded.status_code == 201, uploaded.text
    document_id = uploaded.json()["id"]
    parse_job = client.post(f"/api/documents/{document_id}/parse", headers=headers)
    assert parse_job.status_code == 202
    parsed = client.get(f"/api/jobs/{parse_job.json()['id']}", headers=headers).json()
    assert parsed["status"] == "completed", parsed
    document = client.get(f"/api/documents/{document_id}", headers=headers).json()
    assert document["page_count"] == 6
    extracted_job = client.post(
        f"/api/projects/{project_id}/requirements/extract",
        headers=headers,
        json={"document_id": document_id},
    )
    assert extracted_job.status_code == 202
    extracted = client.get(f"/api/jobs/{extracted_job.json()['id']}", headers=headers).json()
    assert extracted["status"] == "completed", extracted
    requirements = client.get(f"/api/projects/{project_id}/requirements", headers=headers).json()
    assert len(requirements) >= 15
    assert all(1 <= item["source_page"] <= document["page_count"] for item in requirements)
    candidates = client.get(f"/api/projects/{project_id}/disqualifications", headers=headers).json()
    assert len(candidates) >= 3
    decision = client.post(
        f"/api/disqualifications/{candidates[0]['id']}/confirm",
        headers=headers,
        json={"reason": "复核原文后确认属于否决项"},
    )
    assert decision.status_code == 200
    assert decision.json()["decision"] == "confirmed"
    low_conf = next(item for item in requirements if float(item["extraction_confidence"]) < 0.70)
    corrected = client.patch(
        f"/api/requirements/{low_conf['id']}",
        headers=headers,
        json={"title": low_conf["title"] + "（人工校正）", "reason": "根据原文校正标题"},
    )
    assert corrected.status_code == 200 and corrected.json()["human_verified"] is True
    verified = client.post(
        f"/api/requirements/{low_conf['id']}/verify",
        headers=headers,
        json={"decision": "verify", "reason": "人工核对原文及页码后确认"},
    )
    assert verified.status_code == 200 and verified.json()["human_verified"] is True
    events = client.get(f"/api/projects/{project_id}/audit", headers=headers).json()
    actions = {event["action"] for event in events}
    assert {
        "document.uploaded",
        "document.parsed",
        "requirements.extracted",
        "disqualification.confirmed",
        "requirement.updated",
        "requirement.verify",
    } <= actions
