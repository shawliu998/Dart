from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import select

from app.auth.dependencies import Principal
from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models.entities import AgentArtifact, ComplianceCheck, DocumentPage
from app.services.review_workflows import run_compliance


def test_second_active_run_for_project_returns_409(client, demo) -> None:
    headers = demo["auth_headers"]
    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    active_project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "活动运行防重测试二",
            "project_code": f"ACTIVE-WAIT-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    )
    active_project_id = active_project.json()["id"]
    with pdf_path.open("rb") as pdf:
        uploaded = client.post(
            f"/api/projects/{active_project_id}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    assert uploaded.status_code == 201
    first_active = client.post(
        f"/api/projects/{active_project_id}/agent-runs",
        headers=headers,
        json={"goal": "监督运行等待人工复核", "mode": "supervised"},
    )
    assert first_active.status_code == 201
    assert first_active.json()["run"]["status"] == "queued"
    duplicate = client.post(
        f"/api/projects/{active_project_id}/agent-runs",
        headers=headers,
        json={"goal": "不应创建第二个活动运行"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "当前项目已有活动运行，请继续现有运行或取消后重新启动。"


def test_autonomous_business_outcomes_distinguish_blocked_partial_and_no_result(
    client, demo, monkeypatch
) -> None:
    headers = demo["auth_headers"]

    blocked_project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "缺少主文件结果测试",
            "project_code": f"BLOCKED-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    ).json()
    blocked_created = client.post(
        f"/api/projects/{blocked_project['id']}/agent-runs",
        headers=headers,
        json={"goal": "验证缺少输入的业务结果"},
    )
    blocked_run_id = blocked_created.json()["run"]["id"]
    blocked = client.get(f"/api/agent-runs/{blocked_run_id}", headers=headers).json()["run"]
    assert (blocked["status"], blocked["outcome"]) == ("completed", "blocked")

    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"

    partial_project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "最大动作次数结果测试",
            "project_code": f"PARTIAL-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    ).json()
    with pdf_path.open("rb") as pdf:
        client.post(
            f"/api/projects/{partial_project['id']}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    partial_created = client.post(
        f"/api/projects/{partial_project['id']}/agent-runs",
        headers=headers,
        json={"goal": "验证有限动作结果", "max_iterations": 1},
    )
    partial_run_id = partial_created.json()["run"]["id"]
    partial = client.get(f"/api/agent-runs/{partial_run_id}", headers=headers).json()["run"]
    assert (partial["status"], partial["outcome"]) == ("completed", "partial")

    async def no_requirements(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr("app.services.agent_runtime.run_extraction_job", no_requirements)
    empty_project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "无要求结果测试",
            "project_code": f"NO-RESULT-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    ).json()
    with pdf_path.open("rb") as pdf:
        client.post(
            f"/api/projects/{empty_project['id']}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    empty_created = client.post(
        f"/api/projects/{empty_project['id']}/agent-runs",
        headers=headers,
        json={"goal": "验证未识别要求的业务结果"},
    )
    empty_run_id = empty_created.json()["run"]["id"]
    empty = client.get(f"/api/agent-runs/{empty_run_id}", headers=headers).json()["run"]
    assert (empty["status"], empty["outcome"]) == ("completed", "no_result")


def test_force_recompute_preserves_human_compliance_override(client, demo) -> None:
    headers = demo["auth_headers"]
    project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "人工合规覆盖保留测试",
            "project_code": f"OVERRIDE-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    ).json()
    project_id = UUID(project["id"])
    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    with pdf_path.open("rb") as pdf:
        uploaded = client.post(
            f"/api/projects/{project_id}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    assert uploaded.status_code == 201
    created = client.post(
        f"/api/projects/{project_id}/agent-runs",
        headers=headers,
        json={"goal": "生成用于合规覆盖复算的内部草稿"},
    )
    assert created.status_code == 201
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]),
        user_id=UUID(demo["user_id"]),
        role="admin",
    )
    with SessionLocal() as db:
        check = db.scalar(
            select(ComplianceCheck).where(
                ComplianceCheck.project_id == project_id,
                ComplianceCheck.tenant_id == principal.tenant_id,
            )
        )
        assert check is not None
        check.result = "fail"
        check.reason = "人工覆盖：已核对原件"
        check.reviewed_by = principal.user_id
        check.reviewed_at = utcnow()
        check_id = check.id
        db.commit()

        run_compliance(
            db,
            principal,
            project_id,
            evidence_mode="accepted_and_provisional",
            force_recompute=True,
        )
        preserved = db.get(ComplianceCheck, check_id)
        assert preserved is not None
        assert preserved.result == "fail"
        assert preserved.reason == "人工覆盖：已核对原件"
        assert preserved.reviewed_by == principal.user_id


def test_parse_summary_counts_persisted_ocr_required_pages(client, demo) -> None:
    headers = demo["auth_headers"]
    project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "OCR 汇总测试",
            "project_code": f"OCR-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    )
    project_id = project.json()["id"]
    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    with pdf_path.open("rb") as pdf:
        uploaded = client.post(
            f"/api/projects/{project_id}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    document_id = uploaded.json()["id"]
    parsed = client.post(f"/api/documents/{document_id}/parse", headers=headers)
    assert parsed.status_code == 202
    with SessionLocal() as db:
        page = db.scalar(
            select(DocumentPage)
            .where(DocumentPage.document_id == UUID(document_id))
            .order_by(DocumentPage.page_number)
        )
        assert page is not None
        page.layout_json = {**(page.layout_json or {}), "ocr_required": True}
        db.commit()

    created = client.post(
        f"/api/projects/{project_id}/agent-runs",
        headers=headers,
        json={"goal": "统计需要 OCR 的页面", "mode": "supervised"},
    )
    assert created.status_code == 201
    run_id = created.json()["run"]["id"]
    with SessionLocal() as db:
        artifact = db.scalar(
            select(AgentArtifact).where(
                AgentArtifact.run_id == UUID(run_id),
                AgentArtifact.artifact_type == "parse_summary",
            )
        )
        assert artifact is not None
        assert artifact.metadata_json["ocr_required_count"] == 1
        assert pdf_path.name in artifact.metadata_json["ocr_files"]
