#!/usr/bin/env python3
"""Independent deterministic Phase 0-5 fixture and delivery acceptance.

This script validates the versioned oracle without calling a live model. It also
builds a preview ZIP and SHA256 manifest from the package blueprint so packaging
mechanics can be checked independently of the API implementation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from datetime import date
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demo"
EXPECTED_PATH = DEMO / "expected_results/expected_results.json"
ZIP_TIME = (2026, 1, 1, 0, 0, 0)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"MVP验收失败：{message}")


def unique_keys(items: list[dict[str, Any]], section: str) -> set[str]:
    keys = [str(item.get("key", "")) for item in items]
    require(all(keys), f"{section}存在空key")
    require(len(keys) == len(set(keys)), f"{section}存在重复key")
    return set(keys)


def demo_files_by_name() -> dict[str, Path]:
    result: dict[str, Path] = {}
    for path in DEMO.rglob("*"):
        if path.is_file():
            result.setdefault(path.name, path)
    return result


def validate_reference(reference: str, files: dict[str, Path]) -> None:
    try:
        filename, raw_page = reference.rsplit(":", 1)
        page = int(raw_page)
    except (ValueError, AttributeError) as exc:
        raise SystemExit(f"MVP验收失败：来源格式应为 filename:page，实际为 {reference!r}") from exc
    require(page >= 1, f"来源页码必须从1开始：{reference}")
    require(filename in files, f"来源文件不存在：{reference}")
    path = files[filename]
    if path.suffix.lower() != ".pdf":
        require(page == 1, f"演示OOXML仅声明第1页：{reference}")
        return
    data = path.read_bytes()
    page_tree = re.search(
        rb"/Count\s+(\d+)\s+/Kids\s*\[[^\]]*\]\s+/Type\s+/Pages\b", data
    )
    if page_tree:
        count = int(page_tree.group(1))
    else:
        # Some valid producers order page-tree keys differently. Counting /Page
        # dictionaries is a safe fallback for these small, non-incremental fixtures.
        count = len(re.findall(rb"/Type\s*/Page\b", data))
    require(count > 0, f"PDF缺少可读页面树：{filename}")
    require(page <= count, f"来源页码越界：{reference}，文档共{count}页")


def validate_evidence(data: dict[str, Any], files: dict[str, Path]) -> tuple[set[str], set[str]]:
    assets = data["evidence_assets"]
    asset_keys = unique_keys(assets, "evidence_assets")
    claim_keys: set[str] = set()
    expired_count = 0
    evaluation_date = date.fromisoformat(data["evaluation_date"])
    for asset in assets:
        source = DEMO / asset["source_path"]
        require(source.is_file(), f"证据源文件不存在：{asset['source_path']}")
        require(source.name == asset["filename"], f"证据filename与source_path不一致：{asset['key']}")
        claims = asset.get("claims", [])
        require(claims, f"证据没有Claim：{asset['key']}")
        for claim in claims:
            key = claim.get("key")
            require(key and key not in claim_keys, f"Claim key为空或重复：{key}")
            claim_keys.add(key)
            require(0 <= float(claim["confidence"]) <= 1, f"Claim置信度越界：{key}")
            validate_reference(f"{asset['filename']}:{claim['source_page']}", files)
            require(bool(claim["source_text"]), f"Claim无原文：{key}")
        expiry = asset.get("expiry_date")
        is_expired = bool(expiry and date.fromisoformat(expiry) < evaluation_date)
        require((asset["status"] == "expired") == is_expired, f"证据过期状态错误：{asset['key']}")
        expired_count += int(is_expired)
    require(expired_count == 1, f"必须恰好有1张过期证书，实际{expired_count}")

    matches = data["evidence_matches"]
    unique_keys(matches, "evidence_matches")
    requirement_codes = {item["code"] for item in data["requirements"]}
    for match in matches:
        require(match["requirement_code"] in requirement_codes, f"匹配引用未知要求：{match['key']}")
        require(match["claim_key"] in claim_keys, f"匹配引用未知Claim：{match['key']}")
        require(0 <= float(match["match_score"]) <= 1, f"匹配分越界：{match['key']}")
        if match["status"] == "accepted":
            require(match.get("human_decision") == "accepted", f"AI匹配不得自动接受：{match['key']}")
    return asset_keys, claim_keys


def validate_checks(data: dict[str, Any], files: dict[str, Path]) -> tuple[set[str], set[str]]:
    checks = data["compliance_checks"]
    check_keys = unique_keys(checks, "compliance_checks")
    requirement_codes = {item["code"] for item in data["requirements"]}
    deterministic_types = {
        "amount_maximum", "certificate_expiry", "minimum_count", "required_related_document",
        "minimum_years", "maximum_days", "minimum_days", "equal_rate", "allowed_extension",
        "maximum_bytes", "required_document",
    }
    for check in checks:
        require(check["requirement_code"] in requirement_codes, f"合规检查引用未知要求：{check['key']}")
        require(check["check_type"] in deterministic_types, f"合规检查不是确定性类型：{check['key']}")
        require(check["result"] in {"pass", "fail", "warning", "manual_review", "not_applicable"}, f"合规结果无效：{check['key']}")
        require(check["rule_code"].endswith("_V1"), f"规则必须版本化：{check['key']}")
        require(check["source_references"], f"合规检查无来源：{check['key']}")
        for reference in check["source_references"]:
            validate_reference(reference, files)

    issues = data["consistency_issues"]
    issue_keys = unique_keys(issues, "consistency_issues")
    for issue in issues:
        require(issue["values_found"], f"一致性问题无发现值：{issue['key']}")
        for found in issue["values_found"]:
            validate_reference(found["source"], files)
    required_issue_codes = {
        "LEGAL-NAME-MISMATCH", "BID-AMOUNT-MISMATCH", "UPPERCASE-AMOUNT-MISMATCH",
        "CASE-B-NO-ACCEPTANCE", "PM-EXPERIENCE-SHORT", "PACKAGE-NAME-INVALID",
        "TRACK-CHANGES-PRESENT",
    }
    require(required_issue_codes <= {item["code"] for item in issues}, "跨文件指定故障不完整")
    return check_keys, issue_keys


def validate_amendments_and_tasks(
    data: dict[str, Any], check_keys: set[str], issue_keys: set[str]
) -> tuple[set[str], set[str]]:
    amendments = data["amendments"]
    unique_keys(amendments, "amendments")
    change_items = [change for amendment in amendments for change in amendment["changes"]]
    change_keys = unique_keys(change_items, "amendment changes")
    require(
        {change["type"] for change in change_items}
        == {"deadline_changed", "technical_changed", "added"},
        "补充公告必须包含延期、技术参数修改和新增资质三类变更",
    )
    requirement_codes = {item["code"] for item in data["requirements"]}
    for change in change_items:
        require(change["affected_requirement_codes"], f"公告变更无受影响要求：{change['key']}")
        require(set(change["affected_requirement_codes"]) <= requirement_codes, f"公告变更引用未知要求：{change['key']}")
        require(change["impacts"], f"公告变更无影响对象：{change['key']}")
        for impact in change["impacts"]:
            require(bool(impact["description"]), f"公告影响无说明：{change['key']}")

    validation_keys = {item["key"] for item in data["package"]["expected_validations"]}
    source_registry = {
        "compliance_check": check_keys,
        "consistency_issue": issue_keys,
        "amendment_change": change_keys,
        "package_validation": validation_keys,
    }
    tasks = data["remediation_tasks"]
    task_keys = unique_keys(tasks, "remediation_tasks")
    for task in tasks:
        require(task["source_type"] in source_registry, f"整改任务来源类型无效：{task['key']}")
        require(task["source_key"] in source_registry[task["source_type"]], f"整改任务来源不存在：{task['key']}")
        require(isinstance(task["due_offset_days"], int) and task["due_offset_days"] >= 0, f"任务due offset无效：{task['key']}")
        require(task["assignee_key"] and task["reviewer_key"], f"任务缺少责任人或复核人：{task['key']}")
    return change_keys, task_keys


def archive_path_for(item: dict[str, Any]) -> str:
    suffix = Path(item["source_path"]).suffix.lower()
    path = PurePosixPath(f"{item['name']}{suffix}")
    require(not path.is_absolute() and ".." not in path.parts, f"封装路径不安全：{path}")
    return path.as_posix()


def zip_write(archive: zipfile.ZipFile, name: str, payload: bytes) -> None:
    info = zipfile.ZipInfo(name, ZIP_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, payload)


def build_and_validate_preview(data: dict[str, Any], artifacts: Path) -> tuple[Path, Path, int]:
    package = data["package"]
    items = package["items"]
    item_keys = unique_keys(items, "package.items")
    require(len([item for item in items if item["required"] and item["status"] == "missing"]) == 1, "封装树必须恰好缺少1份必需授权书")
    for item in items:
        require(item["parent_key"] is None or item["parent_key"] in item_keys, f"封装父节点不存在：{item['key']}")
        if item["source_path"] is None:
            require(item["status"] == "missing", f"无源文件的封装项必须为missing：{item['key']}")
            continue
        source = DEMO / item["source_path"]
        require(source.is_file(), f"封装源文件不存在：{item['source_path']}")
        require(source.stat().st_size <= item["max_size_bytes"], f"封装文件超限：{item['key']}")
        require(source.suffix.lower().lstrip(".") in item["allowed_extensions"], f"封装扩展名不允许：{item['key']}")

    technical = DEMO / "bid_documents/技术响应文件.docx"
    with zipfile.ZipFile(technical) as archive:
        document_xml = archive.read("word/document.xml")
    require(b"<w:ins " in document_xml, "技术响应文件必须保留故意设置的修订记录")
    price_item = next(item for item in items if item["key"] == "PKG-PRICE")
    require(price_item["document_filename"] != price_item["naming_rule"].replace("{ext}", "xlsx"), "报价文件必须保留故意命名错误")

    artifacts.mkdir(parents=True, exist_ok=True)
    zip_path = artifacts / package["archive_name"]
    manifest_path = artifacts / package["manifest"]["filename"]
    payloads: list[tuple[str, bytes]] = []
    for item in items:
        if item["source_path"] is None:
            continue
        payloads.append((archive_path_for(item), (DEMO / item["source_path"]).read_bytes()))
    payloads.sort(key=lambda pair: pair[0])
    manifest_lines = [f"{hashlib.sha256(payload).hexdigest()}  {name}" for name, payload in payloads]
    manifest_payload = ("\n".join(manifest_lines) + "\n").encode("utf-8")
    manifest_path.write_bytes(manifest_payload)
    with zipfile.ZipFile(zip_path, "w") as archive:
        for name, payload in payloads:
            zip_write(archive, name, payload)
        zip_write(archive, package["manifest"]["filename"], manifest_payload)

    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), "ZIP存在重复路径")
        require(package["manifest"]["filename"] in names, "ZIP缺少SHA256 manifest")
        for name in names:
            pure = PurePosixPath(name)
            require(not pure.is_absolute() and ".." not in pure.parts, f"ZIP存在路径穿越：{name}")
        for line in archive.read(package["manifest"]["filename"]).decode("utf-8").splitlines():
            digest, name = line.split("  ", 1)
            require(hashlib.sha256(archive.read(name)).hexdigest() == digest, f"ZIP manifest哈希错误：{name}")
    return zip_path, manifest_path, len(payloads)


def validate_audit_and_safety(data: dict[str, Any], artifacts: Path) -> Path:
    actions = data["expected_audit_actions"]
    required_actions = {
        "evidence.uploaded", "evidence_match.accepted", "compliance.run", "compliance.overridden",
        "consistency.run", "amendment.analyzed", "task.created", "package.validated",
        "package.built", "package.approved", "package.downloaded",
    }
    require(required_actions <= set(actions), "审计动作契约不完整")
    safety = data["safety_boundaries"]
    for key in (
        "mock_provider_only", "document_content_is_untrusted", "low_confidence_requires_manual_review",
        "ai_matches_require_human_acceptance", "money_date_count_rules_are_deterministic",
        "audit_is_append_only", "package_approval_requires_human",
    ):
        require(safety.get(key) is True, f"安全守门必须启用：{key}")
    for key in (
        "auto_ca_signing", "auto_guarantee_payment", "captcha_bypass",
        "unattended_external_submission", "legal_qualification_decision",
    ):
        require(safety.get(key) is False, f"禁止能力不得启用：{key}")
    audit_contract_path = artifacts / "audit_contract.json"
    audit_contract_path.write_text(
        json.dumps(
            {"append_only": True, "expected_actions": actions, "note": "契约清单，不是伪造的运行审计事件。"},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return audit_contract_path


def run(artifacts: Path) -> dict[str, Any]:
    data = json.loads(EXPECTED_PATH.read_text(encoding="utf-8"))
    require(data["schema_version"] == "2.0.0", "expected_results schema必须为2.0.0")
    files = demo_files_by_name()
    asset_keys, claim_keys = validate_evidence(data, files)
    check_keys, issue_keys = validate_checks(data, files)
    change_keys, task_keys = validate_amendments_and_tasks(data, check_keys, issue_keys)
    zip_path, manifest_path, packaged_files = build_and_validate_preview(data, artifacts)
    audit_contract_path = validate_audit_and_safety(data, artifacts)
    counts = data["invariants"]
    actual_counts = {
        "evidence_asset_count": len(asset_keys),
        "evidence_claim_count": len(claim_keys),
        "compliance_check_count": len(check_keys),
        "consistency_issue_count": len(issue_keys),
        "amendment_change_count": len(change_keys),
        "remediation_task_count": len(task_keys),
        "package_item_count": len(data["package"]["items"]),
    }
    for key, actual in actual_counts.items():
        require(counts[key] == actual, f"{key}预期{counts[key]}，实际{actual}")
    report = {
        "status": "passed",
        "fixture_id": data["fixture_id"],
        "counts": actual_counts,
        "packaged_files": packaged_files,
        "preview_zip": zip_path.name,
        "preview_zip_sha256": hashlib.sha256(zip_path.read_bytes()).hexdigest(),
        "manifest": manifest_path.name,
        "audit_contract": audit_contract_path.name,
        "live_model_calls": 0,
        "external_submissions": 0,
    }
    (artifacts / "acceptance_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="验证Phase 0-5 fixtures并生成独立封装预览")
    parser.add_argument("--artifacts-dir", type=Path, help="保留验收产物的目录；默认使用临时目录")
    parser.add_argument("--clean", action="store_true", help="运行前清理指定的.data子目录")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.artifacts_dir is None:
        with tempfile.TemporaryDirectory(prefix="bidevidence-acceptance-") as temp:
            report = run(Path(temp))
            print(f"MVP独立验收通过：{report['counts']}，封装文件{report['packaged_files']}个。")
        return
    artifacts = (ROOT / args.artifacts_dir).resolve() if not args.artifacts_dir.is_absolute() else args.artifacts_dir.resolve()
    data_root = (ROOT / ".data").resolve()
    require(artifacts != ROOT and artifacts != data_root, "验收产物目录不能是仓库根或.data根")
    if args.clean:
        require(artifacts.is_relative_to(data_root), "--clean只允许清理仓库.data下的子目录")
        shutil.rmtree(artifacts, ignore_errors=True)
    report = run(artifacts)
    print(f"MVP独立验收通过：{report['counts']}，产物目录：{artifacts}")


if __name__ == "__main__":
    main()
