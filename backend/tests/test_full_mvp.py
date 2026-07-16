from __future__ import annotations

import io
from uuid import UUID, uuid4
from zipfile import ZipFile

from app.auth.dependencies import Principal
from app.auth.tokens import create_token, decode_token
from app.db.session import SessionLocal
from app.models.entities import AsyncJob
from app.services.jobs import dispatch_job
from app.storage.adapter import S3CompatibleStorageAdapter, split_s3_key


def test_local_login_bearer_and_tenant_boundary(client, demo, monkeypatch):
    denied = client.post(
        "/api/auth/login", json={"email": "admin@demo.local", "password": "wrongpass"}
    )
    assert denied.status_code == 401
    login = client.post(
        "/api/auth/login", json={"email": "admin@demo.local", "password": "demo1234"}
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["tenant_id"] == demo["tenant_id"]
    other_tenant = {
        "X-Tenant-ID": str(uuid4()),
        "X-User-ID": demo["user_id"],
        "X-Role": "admin",
    }
    assert (
        client.get(
            f"/api/projects/{demo['project_id']}/compliance", headers=other_tenant
        ).status_code
        == 404
    )

    production_token = create_token(
        {"tenant_id": demo["tenant_id"], "user_id": demo["user_id"], "role": "admin"}
    )
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    try:
        decode_token(production_token)
        raise AssertionError("production default secret must be rejected")
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 503


def test_evidence_compliance_consistency_and_amendment_flow(client, demo):
    headers = demo["auth_headers"]
    project_id = demo["project_id"]
    evidence = client.get("/api/evidence", headers=headers)
    assert evidence.status_code == 200 and len(evidence.json()) == 7
    matches = client.get(f"/api/projects/{project_id}/evidence-matches", headers=headers)
    assert matches.status_code == 200 and len(matches.json()) == 8
    assert all(
        row["match"]["status"] != "accepted" or row["match"]["human_decision"] == "accepted"
        for row in matches.json()
    )

    checks = client.post(f"/api/projects/{project_id}/compliance/run", headers=headers)
    assert checks.status_code == 200 and len(checks.json()) == 14
    assert {row["rule_code"] for row in checks.json()} >= {
        "AMOUNT_MAX_V1",
        "CERT_VALID_ON_DATE_V1",
        "CASE_COUNT_MIN_V1",
        "EXPERIENCE_MIN_V1",
        "TAX_RATE_EQUAL_V1",
        "REQUIRED_DOCUMENT_V1",
    }
    failed = next(row for row in checks.json() if row["result"] == "fail")
    override = client.post(
        f"/api/compliance-checks/{failed['id']}/override",
        headers=headers,
        json={"result": "manual_review", "reason": "等待补充材料后重新判断"},
    )
    assert override.status_code == 200 and override.json()["reviewed_by"] == demo["user_id"]

    issues = client.post(f"/api/projects/{project_id}/consistency/run", headers=headers)
    assert issues.status_code == 200 and len(issues.json()) == 7
    assert all(row["document_references"] for row in issues.json())
    resolved = client.post(
        f"/api/consistency-issues/{issues.json()[0]['id']}/resolve",
        headers=headers,
        json={"status": "resolved", "resolution": "采用营业执照中的法定名称"},
    )
    assert resolved.status_code == 200 and resolved.json()["status"] == "resolved"

    amendments = client.get(f"/api/projects/{project_id}/amendments", headers=headers).json()
    changes = client.get(f"/api/amendments/{amendments[0]['id']}/changes", headers=headers).json()
    assert len(changes) == 3
    assert all(change["new_text"] and change["impacts"] for change in changes)
    applied = client.post(f"/api/amendments/{amendments[0]['id']}/apply", headers=headers)
    assert applied.status_code == 200 and applied.json()["analysis_status"] == "applied"
    assert (
        client.get(f"/api/projects/{project_id}", headers=headers)
        .json()["deadline"]
        .startswith("2026-08-06")
    )
    applied_changes = client.get(
        f"/api/amendments/{amendments[0]['id']}/changes", headers=headers
    ).json()
    assert all(
        impact["affected_task_id"]
        for change in applied_changes
        for impact in change["impacts"]
        if impact["requires_reapproval"]
    )


def test_task_package_manifest_download_and_worker(client, demo):
    headers = demo["auth_headers"]
    project_id = demo["project_id"]
    issues = client.get(f"/api/projects/{project_id}/consistency", headers=headers).json()
    created = client.post(
        f"/api/projects/{project_id}/tasks",
        headers=headers,
        json={
            "source_type": "consistency_issue",
            "source_id": issues[0]["id"],
            "title": "复核主体名称",
            "description": "根据营业执照统一主体名称",
            "priority": "high",
        },
    )
    assert created.status_code == 201
    task_id = created.json()["id"]
    assert (
        client.post(
            f"/api/tasks/{task_id}/complete", headers=headers, json={"note": "已完成材料修订"}
        ).json()["status"]
        == "ready_for_review"
    )
    assert (
        client.post(
            f"/api/tasks/{task_id}/review", headers=headers, json={"note": "复核通过"}
        ).json()["status"]
        == "done"
    )

    validation = client.post(f"/api/projects/{project_id}/package/validate", headers=headers)
    assert validation.status_code == 200
    items = validation.json()
    missing = next(item for item in items if item["name"] == "03_授权委托书")
    assert any(result["result"] == "fail" for result in missing["validation_results"])
    blocked = client.post(
        f"/api/projects/{project_id}/package/build",
        headers=headers,
        json={"approved": True, "approval_reason": "人工知悉警告"},
    )
    assert blocked.status_code == 409

    preview = client.post(f"/api/projects/{project_id}/package/preview", headers=headers)
    assert preview.status_code == 200 and preview.json()["status"] == "preview"
    download = client.get(
        f"/api/submission-packages/{preview.json()['id']}/download", headers=headers
    )
    assert download.status_code == 200
    with ZipFile(io.BytesIO(download.content)) as archive:
        names = set(archive.namelist())
        assert {"MANIFEST.json", "SHA256SUMS.txt", "CHECK_REPORT.json"} <= names

    donor_document = next(
        document["id"]
        for document in client.get(f"/api/projects/{project_id}/documents", headers=headers).json()
        if document["mime_type"] == "application/pdf"
    )
    bound = client.patch(
        f"/api/package-items/{missing['id']}",
        headers=headers,
        json={
            "document_id": donor_document,
            "human_confirmed": True,
            "reason": "演示中人工绑定替代授权材料",
        },
    )
    assert bound.status_code == 200
    approved = client.post(
        f"/api/projects/{project_id}/package/build",
        headers=headers,
        json={"approved": True, "approval_reason": "授权人员确认剩余非阻断警告"},
    )
    assert approved.status_code == 200 and approved.json()["status"] == "approved"

    audit_export = client.get(f"/api/projects/{project_id}/audit/export", headers=headers)
    assert (
        audit_export.status_code == 200
        and "attachment" in audit_export.headers["content-disposition"]
    )
    audit_actions = {
        row["action"]
        for row in client.get(f"/api/projects/{project_id}/audit", headers=headers).json()
    }
    assert {
        "package.downloaded",
        "package.approved",
        "audit.exported",
        "task.review",
    } <= audit_actions

    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]), user_id=UUID(demo["user_id"]), role="admin"
    )
    with SessionLocal() as db:
        job = AsyncJob(
            tenant_id=principal.tenant_id,
            created_by=principal.user_id,
            job_type="package_validate",
            entity_id=uuid4(),
        )
        job.entity_id = UUID(project_id)
        db.add(job)
        db.commit()
        job_id = job.id
    assert dispatch_job(job_id)
    with SessionLocal() as db:
        assert db.get(AsyncJob, job_id).status == "completed"


def test_storage_key_rejects_path_traversal():
    try:
        split_s3_key("s3://bucket/tenant/../../secret")
        raise AssertionError("path traversal must fail")
    except ValueError:
        pass


def test_minio_credentials_are_forwarded_without_logging(monkeypatch):
    import boto3

    captured = {}

    class FakeClient:
        pass

    def fake_client(service, **kwargs):
        captured.update({"service": service, **kwargs})
        return FakeClient()

    monkeypatch.setattr(boto3, "client", fake_client)
    S3CompatibleStorageAdapter(
        "http://minio:9000", "bidevidence", "us-east-1", "local-access", "local-secret"
    )
    assert captured == {
        "service": "s3",
        "endpoint_url": "http://minio:9000",
        "region_name": "us-east-1",
        "aws_access_key_id": "local-access",
        "aws_secret_access_key": "local-secret",
    }
