from __future__ import annotations

from pathlib import Path
from uuid import uuid4

P1_STEP_KEYS = [
    "ingest_documents",
    "parse_documents",
    "extract_project_profile",
    "extract_requirements",
    "review_requirements",
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
        json={"goal": "解析招标文件，抽取要求并等待人工复核"},
    )
    assert created.status_code == 201, created.text
    run_id = created.json()["run"]["id"]
    paused = client.get(f"/api/agent-runs/{run_id}", headers=headers)
    assert paused.status_code == 200, paused.text
    paused_data = paused.json()
    assert paused_data["run"]["status"] == "waiting_approval"
    assert [step["step_key"] for step in paused_data["steps"]] == P1_STEP_KEYS
    assert [step["status"] for step in paused_data["steps"][:-1]] == ["completed"] * 4
    assert paused_data["steps"][-1]["status"] == "waiting_approval"
    assert len(paused_data["approvals"]) == 1
    return paused_data, paused_data["approvals"][0]["id"]


def _assert_strictly_increasing_event_sequences(client, headers: dict[str, str], run_id: str) -> list[dict]:
    response = client.get(f"/api/agent-runs/{run_id}/events", headers=headers)
    assert response.status_code == 200, response.text
    events = response.json()
    sequences = [event["sequence"] for event in events]
    assert sequences == list(range(1, len(events) + 1))
    return events


def test_agent_run_persists_steps_events_and_resumes_after_approval(client, demo) -> None:
    """The API-backed P1 slice pauses at the review gate and resumes durably."""
    headers = demo["auth_headers"]
    paused_data, approval_id = _create_run_waiting_for_approval(client, demo)
    run_id = paused_data["run"]["id"]
    event_data = _assert_strictly_increasing_event_sequences(client, headers, run_id)
    assert {event["event_type"] for event in event_data} >= {
        "run.created",
        "run.started",
        "approval.requested",
    }

    completed = client.post(
        f"/api/approvals/{approval_id}/approve",
        headers=headers,
        json={"reason": "已核对招标文件原文与要求来源"},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["run"]["status"] == "completed"
    assert completed.json()["approvals"][0]["status"] == "approved"
    assert completed.json()["steps"][-1]["status"] == "completed"
    candidates = [item for item in completed.json()["artifacts"] if item["artifact_type"] == "evidence_match_candidates"]
    assert len(candidates) == 1
    assert candidates[0]["metadata_json"]["href"] == f"/projects/{completed.json()['run']['project_id']}/evidence-matching"

    final_events = _assert_strictly_increasing_event_sequences(client, headers, run_id)
    assert len(final_events) > len(event_data)
    assert {"evidence.matches_suggested", "run.completed"} <= {event["event_type"] for event in final_events}


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
    assert data["steps"][-1]["status"] == "cancelled"
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
