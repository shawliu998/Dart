#!/usr/bin/env python3
"""Validate delivery documentation, local links, safe defaults and fixture paths."""

from __future__ import annotations

import json
import re
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_DOCS = {
    "PRD.md", "ARCHITECTURE.md", "UI_SPEC.md", "DATA_MODEL.md",
    "AI_DESIGN.md", "EVALS.md", "SECURITY.md", "THIRD_PARTY_LICENSES.md",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"交付校验失败：{message}")


def main() -> None:
    actual_docs = {path.name for path in (ROOT / "docs").glob("*.md")}
    require(REQUIRED_DOCS <= actual_docs, f"缺少文档：{sorted(REQUIRED_DOCS - actual_docs)}")
    markdown_files = [
        ROOT / "README.md", ROOT / "demo/README.md", *sorted((ROOT / "docs").glob("*.md"))
    ]
    for markdown in markdown_files:
        text = markdown.read_text(encoding="utf-8")
        require(len(text.strip()) >= 100, f"文档内容过短：{markdown.relative_to(ROOT)}")
        for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", text):
            if "://" in target or target.startswith("#"):
                continue
            resolved = (markdown.parent / target).resolve()
            require(resolved.exists(), f"失效链接：{markdown.relative_to(ROOT)} -> {target}")

    env_text = (ROOT / ".env.example").read_text(encoding="utf-8")
    require("LLM_PROVIDER=mock" in env_text, "默认LLM_PROVIDER必须为mock")
    require(re.search(r"^OPENAI_API_KEY=$", env_text, re.MULTILINE) is not None, "OPENAI_API_KEY示例必须为空")
    require("DEMO_ADMIN_EMAIL=admin@demo.local" in env_text, "演示邮箱不一致")
    require("DEMO_ADMIN_PASSWORD=demo1234" in env_text, "演示密码不一致")
    require("APP_ENV=development" in env_text, "示例环境必须为development")

    ignore_text = (ROOT / ".gitignore").read_text(encoding="utf-8")
    for pattern in (".env", "*.db", "uploads/", ".data/", ".next/"):
        require(pattern in ignore_text, f".gitignore缺少：{pattern}")

    expected = json.loads(
        (ROOT / "demo/expected_results/expected_results.json").read_text(encoding="utf-8")
    )
    for section in (
        "evidence_assets", "compliance_checks", "consistency_issues", "amendments",
        "remediation_tasks", "package",
    ):
        require(section in expected, f"expected_results缺少：{section}")
    for item in expected["package"]["items"]:
        source_path = item.get("source_path")
        if source_path is None:
            continue
        pure = PurePosixPath(source_path)
        require(not pure.is_absolute() and ".." not in pure.parts, f"不安全fixture路径：{source_path}")
        require((ROOT / "demo" / source_path).is_file(), f"fixture路径不存在：{source_path}")

    print(
        f"交付校验通过：8份必需文档、{len(markdown_files)}个Markdown文件、"
        "安全默认值和fixture路径均有效。"
    )


if __name__ == "__main__":
    main()
