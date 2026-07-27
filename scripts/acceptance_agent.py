#!/usr/bin/env python3
"""Exercise one complete autonomous draft run against a running local API."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import time
import urllib.request
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"Agent API验收失败：{message}")


class Client:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.token: str | None = None

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        payload: dict[str, Any] | None = None,
    ) -> Any:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=data, method=method, headers=headers
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else None

    def login(self) -> None:
        identity = self.request(
            "/api/auth/login",
            method="POST",
            payload={"email": "admin@demo.local", "password": "demo1234"},
        )
        self.token = identity["access_token"]

    def upload(self, project_id: str, document_type: str, path: Path) -> dict[str, Any]:
        boundary = f"----BidEvidenceAcceptance{uuid4().hex}"
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        body = bytearray()
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"document_type\"\r\n\r\n{document_type}\r\n".encode())
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\nContent-Type: {mime}\r\n\r\n".encode())
        body.extend(path.read_bytes())
        body.extend(f"\r\n--{boundary}--\r\n".encode())
        headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(
            f"{self.base_url}/api/projects/{project_id}/documents",
            data=bytes(body),
            method="POST",
            headers=headers,
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))


def run(base_url: str, artifacts_dir: Path) -> dict[str, Any]:
    client = Client(base_url)
    client.login()
    suffix = uuid4().hex[:8]
    project = client.request(
        "/api/projects",
        method="POST",
        payload={
            "name": f"Agent完整验收-{suffix}",
            "project_code": f"AGENT-ACCEPT-{suffix}",
            "buyer_name": "Agent验收采购人",
        },
    )
    project_id = project["id"]
    client.upload(project_id, "tender_main", ROOT / "demo/tender/招标文件.pdf")
    evidence_document = client.upload(
        project_id, "enterprise_evidence", ROOT / "demo/evidence/案例合同A.pdf"
    )
    evidence = client.request(
        "/api/evidence",
        method="POST",
        payload={
            "document_id": evidence_document["id"],
            "name": f"Agent验收案例合同-{suffix}",
            "evidence_type": "contract",
            "legal_entity": "上海智园数字科技有限公司",
            "sensitivity": "internal",
            "tags": ["agent-acceptance"],
        },
    )
    created = client.request(
        f"/api/projects/{project_id}/agent-runs",
        method="POST",
        payload={
            "goal": "自主分析招标文件、抽取证据 Claim 并生成内部工作包",
            "mode": "autonomous_draft",
            "scope": "full_bid_draft",
            "max_iterations": 20,
        },
    )
    run_id = created["run"]["id"]
    bundle = created
    for _ in range(60):
        if bundle["run"]["status"] in {"waiting_approval", "completed", "failed", "cancelled"}:
            break
        time.sleep(0.5)
        bundle = client.request(f"/api/agent-runs/{run_id}")

    run_data = bundle["run"]
    require(run_data["status"] == "waiting_approval", f"运行未进入最终复核：{run_data['status']}")
    require(run_data["outcome"] == "success", f"业务结果不是success：{run_data['outcome']}")
    steps = {item["step_key"]: item for item in bundle["steps"]}
    required_steps = {
        "extract_evidence_claims",
        "match_evidence",
        "run_compliance_rules",
        "draft_responses",
        "check_response_quality",
        "create_remediation_tasks",
        "export_artifacts",
    }
    require(required_steps <= steps.keys(), "自主工作流缺少关键步骤")
    require(all(steps[key]["status"] in {"completed", "waiting_approval"} for key in required_steps), "关键步骤未完成")
    artifact_types = {item["artifact_type"] for item in bundle["artifacts"]}
    required_artifacts = {
        "evidence_claims",
        "evidence_match_candidates",
        "compliance_summary",
        "response_drafts",
        "response_quality_check",
        "remediation_tasks",
        "compliance_matrix_xlsx",
        "response_draft_docx",
        "risk_tasks_xlsx",
    }
    require(required_artifacts <= artifact_types, f"缺少产物：{sorted(required_artifacts - artifact_types)}")

    detail = client.request(f"/api/evidence/{evidence['id']}")
    require(len(detail["claims"]) >= 3, "新企业材料未抽取字段级 Claim")
    require(
        {claim["claim_type"] for claim in detail["claims"]}
        >= {"customer_reference", "contract_amount", "acceptance_link"},
        "合同 Claim 类型不完整",
    )
    responses = client.request(f"/api/projects/{project_id}/responses")
    require(len(responses) > 0, "未生成分类响应")
    category_strategies = {
        "资格资质型响应",
        "技术实施型响应",
        "商务条件型响应",
        "人员配置型响应",
        "案例业绩型响应",
        "交付计划型响应",
    }
    observed_strategies = {item.get("response_strategy") for item in responses}
    require(
        category_strategies <= observed_strategies,
        "未根据条款类别生成差异化响应",
    )
    require(
        len(observed_strategies) >= 2,
        "所有响应仍使用同一策略",
    )
    require(
        any(
            item.get("response_strategy") == "低置信度条款，需人工确认原始文本"
            and item.get("status") == "needs_review"
            for item in responses
        ),
        "低置信度响应未进入人工复核",
    )
    require(
        all(
            phrase not in item.get("response_text", "")
            for item in responses
            for phrase in ("我方完全满足", "我方予以响应")
        ),
        "响应中仍存在无证据的通用承诺",
    )
    require(
        any(item.get("evidence_claim_ids") for item in responses),
        "分类响应未引用任何企业证据 Claim",
    )
    tasks = client.request(f"/api/projects/{project_id}/tasks")
    require(any(item["source_type"].startswith("agent_") for item in tasks), "未生成Agent补救任务")
    events = client.request(f"/api/agent-runs/{run_id}/events")
    event_types = {item["event_type"] for item in events}
    require({"agent.decision", "tool.completed", "response_quality.pass_completed"} <= event_types, "Agent事件流不完整")

    approval = next(
        item
        for item in bundle["approvals"]
        if item["status"] == "pending" and item["approval_type"] == "final_work_package_review"
    )
    completed = client.request(
        f"/api/approvals/{approval['id']}/approve",
        method="POST",
        payload={"reason": "Agent完整验收已核对内部工作包"},
    )
    require(completed["run"]["status"] == "completed", "最终复核后运行未完成")

    report = {
        "status": "passed",
        "project_id": project_id,
        "run_id": run_id,
        "iterations": completed["run"]["iteration"],
        "steps": len(bundle["steps"]),
        "artifacts": sorted(artifact_types),
        "claims": len(detail["claims"]),
        "responses": len(responses),
        "response_strategies": sorted(strategy for strategy in observed_strategies if strategy),
        "agent_tasks": sum(item["source_type"].startswith("agent_") for item in tasks),
        "events": len(events),
        "final_status": completed["run"]["status"],
    }
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    (artifacts_dir / "agent_acceptance_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="验收运行中的自主投标Agent")
    parser.add_argument("--base-url", default=os.getenv("API_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--artifacts-dir", type=Path, default=Path(".data/agent-acceptance"))
    args = parser.parse_args()
    artifacts = (ROOT / args.artifacts_dir).resolve() if not args.artifacts_dir.is_absolute() else args.artifacts_dir.resolve()
    data_root = (ROOT / ".data").resolve()
    require(artifacts.is_relative_to(data_root) and artifacts != data_root, "验收产物必须位于.data子目录")
    report = run(args.base_url, artifacts)
    print(f"自主Agent验收通过：{report}")


if __name__ == "__main__":
    main()
