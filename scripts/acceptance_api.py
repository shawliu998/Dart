#!/usr/bin/env python3
"""Run Phase 2-5 acceptance against a seeded, running local API."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import urllib.error
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = json.loads(
    (ROOT / "demo/expected_results/expected_results.json").read_text(encoding="utf-8")
)
PROJECT_ID = EXPECTED["identities"]["project_id"]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"API验收失败：{message}")


class Client:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.token: str | None = None

    def request(
        self, path: str, *, method: str = "GET", payload: dict[str, Any] | None = None
    ) -> tuple[Any, bytes]:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=data, method=method, headers=headers
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read()
            content_type = response.headers.get("Content-Type", "")
            parsed = json.loads(raw.decode("utf-8")) if "json" in content_type else None
            return parsed, raw

    def login(self) -> dict[str, Any]:
        payload, _ = self.request(
            "/api/auth/login",
            method="POST",
            payload={"email": "admin@demo.local", "password": "demo1234"},
        )
        require(payload["email"] == "admin@demo.local", "登录返回了错误身份")
        self.token = payload["access_token"]
        return payload


def verify_sha256s(archive: zipfile.ZipFile) -> None:
    names = archive.namelist()
    require("MANIFEST.json" in names, "服务ZIP缺少MANIFEST.json")
    require("SHA256SUMS.txt" in names, "服务ZIP缺少SHA256SUMS.txt")
    require(len(names) == len(set(names)), "服务ZIP存在重复路径")
    for name in names:
        path = PurePosixPath(name)
        require(not path.is_absolute() and ".." not in path.parts, f"服务ZIP路径不安全：{name}")
    manifest = json.loads(archive.read("MANIFEST.json").decode("utf-8"))
    manifest_names = {item["name"] for item in manifest["files"]}
    for item in manifest["files"]:
        require(item["name"] in names, f"MANIFEST引用缺失文件：{item['name']}")
        require(
            hashlib.sha256(archive.read(item["name"])).hexdigest() == item["sha256"],
            f"MANIFEST哈希错误：{item['name']}",
        )
    sum_names: set[str] = set()
    for line in archive.read("SHA256SUMS.txt").decode("utf-8").splitlines():
        digest, name = line.split("  ", 1)
        sum_names.add(name)
        require(hashlib.sha256(archive.read(name)).hexdigest() == digest, f"SHA256SUMS错误：{name}")
    require(sum_names == manifest_names, "MANIFEST与SHA256SUMS文件集合不一致")


def run(base_url: str, artifacts: Path) -> dict[str, Any]:
    client = Client(base_url)
    health, _ = client.request("/health")
    require(health.get("service") == "bidevidence-api", "目标不是BidEvidence API")
    identity = client.login()

    evidence, _ = client.request("/api/evidence")
    require(len(evidence) == EXPECTED["invariants"]["evidence_asset_count"], "证据数量不一致")
    claim_count = 0
    for asset in evidence:
        detail, _ = client.request(f"/api/evidence/{asset['id']}")
        claim_count += len(detail["claims"])
    require(claim_count == EXPECTED["invariants"]["evidence_claim_count"], "Claim数量不一致")

    matches, _ = client.request(f"/api/projects/{PROJECT_ID}/evidence-matches")
    require(len(matches) == len(EXPECTED["evidence_matches"]), "证据匹配数量不一致")
    require(
        all(
            item["match"]["status"] != "accepted"
            or item["match"]["human_decision"] == "accepted"
            for item in matches
        ),
        "发现未经人工决定的accepted证据匹配",
    )

    compliance, _ = client.request(f"/api/projects/{PROJECT_ID}/compliance")
    consistency, _ = client.request(f"/api/projects/{PROJECT_ID}/consistency")
    amendments, _ = client.request(f"/api/projects/{PROJECT_ID}/amendments")
    tasks, _ = client.request(f"/api/projects/{PROJECT_ID}/tasks")
    require(len(compliance) == EXPECTED["invariants"]["compliance_check_count"], "合规检查数量不一致")
    require(len(consistency) == EXPECTED["invariants"]["consistency_issue_count"], "一致性问题数量不一致")
    require(len(amendments) == 1, "补充公告数量不一致")
    require(len(tasks) == EXPECTED["invariants"]["remediation_task_count"], "整改任务数量不一致")
    changes, _ = client.request(f"/api/amendments/{amendments[0]['id']}/changes")
    require(len(changes) == EXPECTED["invariants"]["amendment_change_count"], "公告变更数量不一致")
    require(all(change["impacts"] for change in changes), "公告变更缺少影响对象")

    package_overview, _ = client.request(f"/api/projects/{PROJECT_ID}/package")
    require(len(package_overview["items"]) == EXPECTED["invariants"]["package_item_count"], "封装树数量不一致")
    require(package_overview["external_submission_supported"] is False, "不得启用外部自动提交")
    validated, _ = client.request(f"/api/projects/{PROJECT_ID}/package/validate", method="POST")
    require(any(item["status"] in {"missing", "invalid"} for item in validated), "演示封装必须保留阻断项")

    preview, _ = client.request(f"/api/projects/{PROJECT_ID}/package/preview", method="POST")
    require(preview["status"] == "preview", "预览包状态错误")
    _, zip_bytes = client.request(f"/api/submission-packages/{preview['id']}/download")

    artifacts.mkdir(parents=True, exist_ok=True)
    zip_path = artifacts / "service_preview.zip"
    zip_path.write_bytes(zip_bytes)
    require(hashlib.sha256(zip_bytes).hexdigest() == preview["sha256"], "下载ZIP哈希与数据库不一致")
    with zipfile.ZipFile(zip_path) as archive:
        verify_sha256s(archive)

    try:
        client.request(
            f"/api/projects/{PROJECT_ID}/package/build",
            method="POST",
            payload={"approved": True, "approval_reason": "验收脚本不得越过必需文件失败"},
        )
    except urllib.error.HTTPError as exc:
        require(exc.code == 409, f"必需文件阻断审批应返回409，实际{exc.code}")
    else:
        raise SystemExit("API验收失败：存在必需文件fail时错误地批准了封装包")

    audit, _ = client.request(f"/api/projects/{PROJECT_ID}/audit")
    actions = {event["action"] for event in audit}
    require({"package.validated", "package.previewed", "package.downloaded"} <= actions, "封装审计动作不完整")
    _, audit_export = client.request(f"/api/projects/{PROJECT_ID}/audit/export")
    exported = json.loads(audit_export.decode("utf-8"))
    require(len(exported) >= len(audit), "审计导出数量异常")
    (artifacts / "service_audit_export.json").write_bytes(audit_export)

    report = {
        "status": "passed",
        "base_url": base_url,
        "identity": {key: identity[key] for key in ("email", "role", "tenant_id", "user_id")},
        "counts": {
            "evidence_assets": len(evidence),
            "claims": claim_count,
            "matches": len(matches),
            "compliance_checks": len(compliance),
            "consistency_issues": len(consistency),
            "amendment_changes": len(changes),
            "tasks": len(tasks),
            "package_items": len(package_overview["items"]),
            "audit_events": len(audit),
        },
        "preview_sha256": preview["sha256"],
        "blocked_unsafe_approval": True,
        "external_submission_supported": False,
    }
    (artifacts / "service_acceptance_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="验收运行中的BidEvidence Phase 2-5 API")
    parser.add_argument("--base-url", default=os.getenv("API_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--artifacts-dir", type=Path, default=Path(".data/service-acceptance"))
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()
    artifacts = (ROOT / args.artifacts_dir).resolve() if not args.artifacts_dir.is_absolute() else args.artifacts_dir.resolve()
    data_root = (ROOT / ".data").resolve()
    require(artifacts.is_relative_to(data_root) and artifacts != data_root, "API验收产物必须位于.data子目录")
    if args.clean:
        shutil.rmtree(artifacts, ignore_errors=True)
    report = run(args.base_url, artifacts)
    print(f"运行中API验收通过：{report['counts']}，产物目录：{artifacts}")


if __name__ == "__main__":
    main()
