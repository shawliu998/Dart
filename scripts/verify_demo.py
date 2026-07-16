#!/usr/bin/env python3
"""Validate deterministic fixture coverage and basic container formats."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demo"
EXPECTED_PATH = DEMO / "expected_results/expected_results.json"
MANIFEST_PATH = DEMO / "expected_results/generated_manifest.json"

REQUIRED_FILES = {
    "tender/招标文件.pdf",
    "tender/技术需求附件.docx",
    "amendments/补充公告01.pdf",
    "evidence/营业执照.pdf",
    "evidence/ISO27001证书.pdf",
    "evidence/ISO9001证书.pdf",
    "evidence/项目经理证书.pdf",
    "evidence/案例合同A.pdf",
    "evidence/案例合同B.pdf",
    "evidence/验收报告A.pdf",
    "bid_documents/投标函.docx",
    "bid_documents/商务响应表.xlsx",
    "bid_documents/技术响应文件.docx",
    "bid_documents/报价表.xlsx",
}


def fail(message: str) -> None:
    raise SystemExit(f"演示数据校验失败：{message}")


def main() -> None:
    if not EXPECTED_PATH.exists():
        fail(f"缺少 {EXPECTED_PATH.relative_to(ROOT)}")
    expected = json.loads(EXPECTED_PATH.read_text(encoding="utf-8"))
    if expected.get("schema_version") != "2.0.0":
        fail("expected_results schema_version 必须为2.0.0")
    if len(expected.get("requirements", [])) < 20:
        fail("要求少于20条")
    if len(expected.get("disqualification_candidates", [])) != 3:
        fail("否决项候选必须恰好为3条")
    low_confidence = [r for r in expected["requirements"] if r["confidence"] < 0.70]
    if not low_confidence or any(r["expected_status"] != "manual_review" for r in low_confidence):
        fail("低于0.70的要求必须进入人工复核")
    required_issue_types = {
        "certificate_expired", "legal_entity_name", "bid_amount", "uppercase_amount",
        "missing_evidence", "case_acceptance_missing", "experience_years",
        "package_missing_file", "filename", "tracked_changes",
    }
    actual_issue_types = {issue["type"] for issue in expected.get("expected_issues", [])}
    if not required_issue_types <= actual_issue_types:
        fail(f"缺少故障类型：{sorted(required_issue_types - actual_issue_types)}")
    required_sections = {
        "evidence_assets", "evidence_matches", "compliance_checks", "consistency_issues",
        "amendments", "remediation_tasks", "package", "expected_audit_actions", "safety_boundaries",
    }
    missing_sections = sorted(required_sections - expected.keys())
    if missing_sections:
        fail(f"缺少MVP oracle分区：{missing_sections}")
    invariants = expected["invariants"]
    count_sections = {
        "evidence_asset_count": expected["evidence_assets"],
        "evidence_claim_count": [claim for asset in expected["evidence_assets"] for claim in asset["claims"]],
        "compliance_check_count": expected["compliance_checks"],
        "consistency_issue_count": expected["consistency_issues"],
        "amendment_change_count": [change for amendment in expected["amendments"] for change in amendment["changes"]],
        "remediation_task_count": expected["remediation_tasks"],
        "package_item_count": expected["package"]["items"],
    }
    for key, items in count_sections.items():
        if invariants.get(key) != len(items):
            fail(f"{key}计数不一致：预期{invariants.get(key)}，实际{len(items)}")

    missing = sorted(name for name in REQUIRED_FILES if not (DEMO / name).exists())
    if missing:
        fail(f"缺少文件：{missing}；请先运行 make generate-demo")
    for name in REQUIRED_FILES:
        path = DEMO / name
        if path.suffix == ".pdf" and not path.read_bytes().startswith(b"%PDF-"):
            fail(f"PDF签名无效：{name}")
        if path.suffix in {".docx", ".xlsx"}:
            if not zipfile.is_zipfile(path):
                fail(f"OOXML容器无效：{name}")
            with zipfile.ZipFile(path) as archive:
                if "[Content_Types].xml" not in archive.namelist():
                    fail(f"OOXML缺少Content Types：{name}")

    if not MANIFEST_PATH.exists():
        fail("缺少生成清单；请运行 make generate-demo")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != "2.0.0":
        fail("generated_manifest schema_version 必须为2.0.0")
    for item in manifest.get("files", []):
        path = DEMO / item["path"]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != item["sha256"]:
            fail(f"哈希不一致：{item['path']}")
    print(
        "演示数据校验通过："
        f"{len(expected['requirements'])}条要求，3条否决项，{len(REQUIRED_FILES)}个文档，"
        f"{len(expected['evidence_assets'])}份证据，{len(expected['compliance_checks'])}项合规检查。"
    )


if __name__ == "__main__":
    main()
