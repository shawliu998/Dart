from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import update

from app.auth.dependencies import Principal
from app.db.session import SessionLocal
from app.models.entities import AgentEvent, AgentRun
from app.services import agent_runtime, jobs
from app.services.demo_seed import stable_id

WORKFLOW_STEP_KEYS = [
    "ingest_documents",
    "parse_documents",
    "extract_project_profile",
    "extract_requirements",
    "review_requirements",
    "match_evidence",
    "review_evidence_matches",
    "run_compliance_rules",
    "draft_responses",
    "review_responses",
    "export_artifacts",
]


def _create_run_waiting_for_approval(client, demo) -> tuple[dict, str]:
    """Create a real run through the public API and return its approval id."""
    headers = demo["auth_headers"]
    project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "Agent 运行持久化测试",
            "project_code": f"AGENT-RUN-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    )
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    assert pdf_path.is_file(), "the deterministic tender fixture is required for this flow"
    with pdf_path.open("rb") as pdf:
        uploaded = client.post(
            f"/api/projects/{project_id}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    assert uploaded.status_code == 201, uploaded.text

    created = client.post(
        f"/api/projects/{project_id}/agent-runs",
        headers=headers,
        json={"goal": "解析招标文件，抽取要求并等待人工复核", "mode": "supervised"},
    )
    assert created.status_code == 201, created.text
    run_id = created.json()["run"]["id"]
    paused = client.get(f"/api/agent-runs/{run_id}", headers=headers)
    assert paused.status_code == 200, paused.text
    paused_data = paused.json()
    assert paused_data["run"]["status"] == "waiting_approval"
    assert [step["step_key"] for step in paused_data["steps"]] == WORKFLOW_STEP_KEYS
    assert [step["status"] for step in paused_data["steps"][:4]] == ["completed"] * 4
    assert paused_data["steps"][4]["status"] == "waiting_approval"
    assert [step["status"] for step in paused_data["steps"][5:]] == ["pending"] * 6
    assert len(paused_data["approvals"]) == 1
    return paused_data, paused_data["approvals"][0]["id"]


def _assert_strictly_increasing_event_sequences(client, headers: dict[str, str], run_id: str) -> list[dict]:
    response = client.get(f"/api/agent-runs/{run_id}/events", headers=headers)
    assert response.status_code == 200, response.text
    events = response.json()
    sequences = [event["sequence"] for event in events]
    assert sequences == list(range(1, len(events) + 1))
    return events


def test_autonomous_draft_runs_to_single_final_work_package_review(client, demo) -> None:
    """The default local mode creates provisional work, then requires one final review."""
    headers = demo["auth_headers"]
    project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "自主草稿运行测试",
            "project_code": f"AUTO-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    )
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]
    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    with pdf_path.open("rb") as pdf:
        uploaded = client.post(
            f"/api/projects/{project_id}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    assert uploaded.status_code == 201, uploaded.text

    created = client.post(
        f"/api/projects/{project_id}/agent-runs",
        headers=headers,
        json={"goal": "生成内部草稿工作包"},
    )
    assert created.status_code == 201, created.text
    run_id = created.json()["run"]["id"]
    data = client.get(f"/api/agent-runs/{run_id}", headers=headers).json()
    assert data["run"]["mode"] == "autonomous_draft"
    assert data["run"]["scope"] == "full_bid_draft"
    assert data["run"]["status"] == "waiting_approval"
    assert data["run"]["outcome"] == "success"
    assert data["run"]["current_action"] == "finish_run"
    assert data["run"]["iteration"] <= data["run"]["max_iterations"]
    stages = data["run"]["plan_json"]["stages"]
    assert [stage["key"] for stage in stages] == ["understand", "evidence", "draft", "deliver", "review"]
    assert stages[0]["status"] == stages[1]["status"] == stages[2]["status"] == "completed"
    assert stages[3]["status"] == "completed"
    assert stages[4]["status"] == "waiting_approval"
    assert [item["step_key"] for item in data["steps"]] == WORKFLOW_STEP_KEYS
    assert data["steps"][4]["status"] == "completed"
    assert data["steps"][6]["status"] == "completed"
    assert data["steps"][9]["status"] == "completed"
    profile_artifact = next(item for item in data["artifacts"] if item["artifact_type"] == "project_profile")
    profile = profile_artifact["metadata_json"]
    assert profile["kind"] == "project_profile_candidates"
    assert profile["review_state"] == "manual_review"
    assert set(profile["candidates"]) == {"name", "buyer_name", "project_code", "deadline"}
    assert all(
        item["review_state"] in {"manual_review", "missing"}
        for item in profile["candidates"].values()
    )
    quality_artifact = next(item for item in data["artifacts"] if item["artifact_type"] == "response_quality_check")
    assert 1 <= len(quality_artifact["metadata_json"]["passes"]) <= 2
    assert "issue_count" in quality_artifact["metadata_json"]
    assert quality_artifact["metadata_json"]["review_href"] == f"/projects/{project_id}/review"
    final_approval = next(item for item in data["approvals"] if item["status"] == "pending")
    assert final_approval["approval_type"] == "final_work_package_review"
    assert final_approval["impact_summary"] == f"/projects/{project_id}/review"
    requirements = client.get(f"/api/projects/{project_id}/requirements", headers=headers).json()
    assert requirements
    eligible = [
        item
        for item in requirements
        if float(item["extraction_confidence"]) >= 0.80
        and item["source_document_id"]
        and item["source_page"]
        and item["original_text"]
        and not item["disqualification_if_failed"]
    ]
    ineligible = [item for item in requirements if item not in eligible]
    assert eligible and all(item["review_status"] == "provisional" for item in eligible)
    assert ineligible and all(item["review_status"] != "provisional" for item in ineligible)
    low_confidence = [item for item in requirements if float(item["extraction_confidence"]) < 0.80]
    disqualification = [item for item in requirements if item["disqualification_if_failed"]]
    assert low_confidence and all(item["review_status"] != "provisional" for item in low_confidence)
    assert disqualification and all(item["review_status"] != "provisional" for item in disqualification)
    assert all(item["human_verified"] is False for item in requirements)
    responses = client.get(f"/api/projects/{project_id}/responses", headers=headers).json()
    assert len(responses) == len(requirements)
    responses_by_requirement = {item["requirement_id"]: item for item in responses}
    assert set(responses_by_requirement) == {item["id"] for item in requirements}
    assert all(
        responses_by_requirement[item["id"]]["status"] == "needs_review"
        and responses_by_requirement[item["id"]]["response_strategy"]
        == "否决风险条款，需优先人工确认"
        for item in disqualification
    )
    very_low_confidence = [
        item
        for item in requirements
        if float(item["extraction_confidence"]) < 0.70
        and responses_by_requirement[item["id"]]["response_strategy"]
        != "否决风险条款，需优先人工确认"
    ]
    assert very_low_confidence and all(
        responses_by_requirement[item["id"]]["status"] == "needs_review"
        and responses_by_requirement[item["id"]]["draft_text"]
        == "【待人工确认原始条款后编写响应】"
        for item in very_low_confidence
    )
    matches = client.get(
        f"/api/projects/{project_id}/evidence-matches", headers=headers
    ).json()
    provisional_requirement_ids = {
        item["match"]["requirement_id"]
        for item in matches
        if item["match"]["status"] == "provisional_match"
    }
    checks = client.get(f"/api/projects/{project_id}/compliance", headers=headers).json()
    checks_by_requirement = {item["requirement_id"]: item for item in checks}
    assert provisional_requirement_ids
    assert all(
        checks_by_requirement[requirement_id]["result"] == "manual_review"
        and "provisional" in checks_by_requirement[requirement_id]["reason"]
        for requirement_id in provisional_requirement_ids
    )
    events = _assert_strictly_increasing_event_sequences(client, headers, run_id)
    assert {event["event_type"] for event in events} >= {"agent.decision", "tool.completed", "review.deferred", "response_quality.pass_completed"}

    completed = client.post(
        f"/api/approvals/{final_approval['id']}/approve",
        headers=headers,
        json={"reason": "已在统一复核页完成内部工作包确认"},
    )
    assert completed.status_code == 200, completed.text
    final = completed.json()["run"]
    assert final["status"] == "completed"
    assert final["outcome"] == "success"
    assert final["completion_reason"] == "final_work_package_approved"
    assert next(stage for stage in final["plan_json"]["stages"] if stage["key"] == "review")["status"] == "completed"


def test_autonomous_background_run_uses_persisted_creator_role(
    client, demo, monkeypatch
) -> None:
    """A queued bid-manager run must not be reconstructed as an administrator."""
    observed_roles: list[str] = []
    original_suggest_matches = agent_runtime.suggest_matches

    def recording_suggest_matches(db, principal, project_id, *, provisional=False):
        observed_roles.append(principal.role)
        return original_suggest_matches(
            db, principal, project_id, provisional=provisional
        )

    monkeypatch.setattr(agent_runtime, "suggest_matches", recording_suggest_matches)
    headers = {
        "X-Tenant-ID": demo["tenant_id"],
        "X-User-ID": str(stable_id("USER-BID-MANAGER")),
        "X-Role": "bid_manager",
    }
    project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "后台角色保持测试",
            "project_code": f"ROLE-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    )
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]
    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    with pdf_path.open("rb") as pdf:
        uploaded = client.post(
            f"/api/projects/{project_id}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    assert uploaded.status_code == 201, uploaded.text
    created = client.post(
        f"/api/projects/{project_id}/agent-runs",
        headers=headers,
        json={"goal": "按投标经理权限生成内部草稿"},
    )
    assert created.status_code == 201, created.text
    assert observed_roles
    assert set(observed_roles) == {"bid_manager"}


def test_risk_review_scope_skips_response_and_export_tools(client, demo) -> None:
    headers = demo["auth_headers"]
    project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "风险复核范围测试",
            "project_code": f"RISK-SCOPE-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    )
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]
    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    with pdf_path.open("rb") as pdf:
        uploaded = client.post(
            f"/api/projects/{project_id}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    assert uploaded.status_code == 201, uploaded.text

    created = client.post(
        f"/api/projects/{project_id}/agent-runs",
        headers=headers,
        json={"goal": "只识别招标风险", "scope": "risk_review"},
    )
    assert created.status_code == 201, created.text
    run_id = created.json()["run"]["id"]
    final = client.get(f"/api/agent-runs/{run_id}", headers=headers).json()
    assert final["run"]["status"] == "completed"
    assert final["run"]["outcome"] == "success"
    statuses = {item["step_key"]: item["status"] for item in final["steps"]}
    assert statuses["run_compliance_rules"] == "completed"
    events = client.get(f"/api/agent-runs/{run_id}/events", headers=headers).json()
    completed_tools = {
        item["payload"]["tool"]
        for item in events
        if item["event_type"] == "tool.completed"
    }
    assert "run_compliance_checks" in completed_tools
    assert completed_tools.isdisjoint(
        {"match_evidence", "generate_responses", "assemble_work_package"}
    )
    skipped_steps = {
        item["payload"]["step_key"]
        for item in events
        if item["event_type"] == "step.skipped"
    }
    assert {"match_evidence", "draft_responses", "export_artifacts"} <= skipped_steps


def test_agent_worker_binds_the_durable_lease_guard(client, demo, monkeypatch) -> None:
    """A durable agent run verifies its lease before entering the runtime."""
    observed: list[tuple[object, str]] = []
    original_heartbeat = jobs.heartbeat_job

    def recording_heartbeat(job_id, worker_id):
        observed.append((job_id, worker_id))
        return original_heartbeat(job_id, worker_id)

    monkeypatch.setattr(jobs, "heartbeat_job", recording_heartbeat)
    paused_data, _approval_id = _create_run_waiting_for_approval(client, demo)

    assert paused_data["run"]["status"] == "waiting_approval"
    assert observed


def test_lost_lease_does_not_publish_an_early_terminal_result(client, demo) -> None:
    headers = demo["auth_headers"]
    project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "失租终态测试",
            "project_code": f"LOST-LEASE-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    )
    assert project.status_code == 201, project.text
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]),
        user_id=UUID(demo["user_id"]),
        role="admin",
    )
    with SessionLocal() as db:
        bundle = agent_runtime.create_run(
            db,
            principal,
            UUID(project.json()["id"]),
            goal="验证失租不发布终态",
            input_revision=1,
        )
        run_id = bundle["run"].id

    ownership = iter((True, True, False))
    with agent_runtime.agent_run_heartbeat(lambda: next(ownership)):
        assert agent_runtime.process_agent_run(run_id) is False

    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "running"
        assert run.completion_reason is None
        event_types = {
            item.event_type
            for item in db.query(AgentEvent).filter(AgentEvent.run_id == run_id)
        }
        assert "tool.blocked" not in event_types


def test_committed_cancel_wins_before_an_early_terminal_publish(
    client, demo, monkeypatch
) -> None:
    headers = demo["auth_headers"]
    project = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "取消竞争测试",
            "project_code": f"CANCEL-RACE-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    )
    assert project.status_code == 201, project.text
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]),
        user_id=UUID(demo["user_id"]),
        role="admin",
    )
    with SessionLocal() as db:
        bundle = agent_runtime.create_run(
            db,
            principal,
            UUID(project.json()["id"]),
            goal="验证取消优先于候选终态",
            input_revision=1,
        )
        run_id = bundle["run"].id

    original_event = agent_runtime._event
    cancel_committed = False

    def event_with_cancel(db, run, event_type, payload, step=None):
        nonlocal cancel_committed
        if event_type == "tool.blocked" and not cancel_committed:
            with SessionLocal() as cancelling_db:
                cancelling_db.execute(
                    update(AgentRun)
                    .where(AgentRun.id == run.id)
                    .values(cancel_requested=True)
                )
                cancelling_db.commit()
            cancel_committed = True
        return original_event(db, run, event_type, payload, step)

    monkeypatch.setattr(agent_runtime, "_event", event_with_cancel)
    assert agent_runtime.process_agent_run(run_id) is True

    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "cancelled"
        assert run.cancel_requested is True
        assert run.completion_reason is None
        event_types = {
            item.event_type
            for item in db.query(AgentEvent).filter(AgentEvent.run_id == run_id)
        }
        assert "run.cancelled" in event_types
        assert "tool.blocked" not in event_types


def test_agent_run_persists_three_review_gates_and_exports_after_resuming(client, demo) -> None:
    """A durable run resumes through requirement, evidence, and response review gates."""
    headers = demo["auth_headers"]
    paused_data, approval_id = _create_run_waiting_for_approval(client, demo)
    run_id = paused_data["run"]["id"]
    project_id = paused_data["run"]["project_id"]
    event_data = _assert_strictly_increasing_event_sequences(client, headers, run_id)
    assert {event["event_type"] for event in event_data} >= {
        "run.created",
        "run.started",
        "approval.requested",
    }

    requirements = client.get(f"/api/projects/{project_id}/requirements", headers=headers).json()
    assert requirements
    for requirement in requirements:
        reviewed = client.post(
            f"/api/requirements/{requirement['id']}/verify",
            headers=headers,
            json={"decision": "verify", "reason": "已核对招标文件原文"},
        )
        assert reviewed.status_code == 200, reviewed.text

    resumed = client.post(
        f"/api/approvals/{approval_id}/approve",
        headers=headers,
        json={"reason": "已核对招标文件原文与要求来源"},
    )
    assert resumed.status_code == 200, resumed.text
    evidence_gate = client.get(f"/api/agent-runs/{run_id}", headers=headers).json()
    assert evidence_gate["run"]["status"] == "waiting_approval"
    assert evidence_gate["steps"][5]["status"] == "completed"
    assert evidence_gate["steps"][6]["status"] == "waiting_approval"
    candidates = [item for item in evidence_gate["artifacts"] if item["artifact_type"] == "evidence_match_candidates"]
    assert len(candidates) == 1
    assert candidates[0]["metadata_json"]["href"] == f"/projects/{project_id}/evidence-matching"

    evidence_approval = next(item for item in evidence_gate["approvals"] if item["status"] == "pending")
    resumed = client.post(
        f"/api/approvals/{evidence_approval['id']}/approve",
        headers=headers,
        json={"reason": "已完成证据候选核对"},
    )
    assert resumed.status_code == 200, resumed.text
    response_gate = client.get(f"/api/agent-runs/{run_id}", headers=headers).json()
    assert response_gate["run"]["status"] == "waiting_approval"
    assert response_gate["steps"][8]["status"] == "completed"
    assert response_gate["steps"][9]["status"] == "waiting_approval"
    response_approval = next(item for item in response_gate["approvals"] if item["status"] == "pending")
    completed = client.post(
        f"/api/approvals/{response_approval['id']}/approve",
        headers=headers,
        json={"reason": "已完成响应草稿复核"},
    )
    assert completed.status_code == 200, completed.text
    final = client.get(f"/api/agent-runs/{run_id}", headers=headers).json()
    assert final["run"]["status"] == "completed"
    assert final["steps"][-1]["status"] == "completed"
    assert {item["artifact_type"] for item in final["artifacts"]} >= {
        "compliance_matrix_xlsx",
        "response_draft_docx",
        "risk_tasks_xlsx",
    }

    final_events = _assert_strictly_increasing_event_sequences(client, headers, run_id)
    assert len(final_events) > len(event_data)
    assert {"run.resumed", "run.completed"} <= {event["event_type"] for event in final_events}


def test_agent_run_rejection_cancels_review_step_and_appends_event(client, demo) -> None:
    headers = demo["auth_headers"]
    paused_data, approval_id = _create_run_waiting_for_approval(client, demo)
    run_id = paused_data["run"]["id"]
    events_before = _assert_strictly_increasing_event_sequences(client, headers, run_id)

    rejected = client.post(
        f"/api/approvals/{approval_id}/reject",
        headers=headers,
        json={"reason": "关键要求来源需要补充核验"},
    )
    assert rejected.status_code == 200, rejected.text
    data = rejected.json()
    assert data["run"]["status"] == "cancelled"
    assert data["approvals"][0]["status"] == "rejected"
    assert data["steps"][4]["status"] == "cancelled"
    events_after = _assert_strictly_increasing_event_sequences(client, headers, run_id)
    assert len(events_after) == len(events_before) + 1
    assert events_after[-1]["event_type"] == "run.cancelled"


def test_desktop_request_rejects_missing_bearer_token(client, monkeypatch, tmp_path) -> None:
    """Desktop mode does not fall back to renderer-controlled identity headers."""
    monkeypatch.setenv("BIDEVIDENCE_DESKTOP_MODE", "1")
    monkeypatch.setenv("BIDEVIDENCE_DESKTOP_TOKEN", "desktop-test-token-" + "x" * 48)
    monkeypatch.setenv("BIDEVIDENCE_LOCAL_TENANT_ID", str(uuid4()))
    monkeypatch.setenv("BIDEVIDENCE_LOCAL_USER_ID", str(uuid4()))
    monkeypatch.setenv("BIDEVIDENCE_APP_DATA_DIR", str(tmp_path))

    response = client.post("/api/dev/seed")
    assert response.status_code == 401
