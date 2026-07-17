from __future__ import annotations

import json
import os
import re
from typing import Protocol, TypeVar

import httpx
from pydantic import BaseModel

from app.schemas.requirements import RequirementBatch


T = TypeVar("T", bound=BaseModel)


class LLMProvider(Protocol):
    name: str
    model: str

    async def structured_generate(
        self,
        *,
        system_prompt: str,
        user_input: str,
        output_schema: type[T],
        metadata: dict,
    ) -> T: ...


class ProviderUnavailableError(RuntimeError):
    """Raised before any model call when a provider is not explicitly available."""


class MockLLMProvider:
    """Deterministic, offline provider. Input is handled only as untrusted text data."""

    name = "mock"
    model = "mock-requirement-extractor-v1"

    async def structured_generate(
        self,
        *,
        system_prompt: str,
        user_input: str,
        output_schema: type[T],
        metadata: dict,
    ) -> T:
        if output_schema is not RequirementBatch:
            raise TypeError("MockLLMProvider only supports explicitly registered schemas")
        source_page = int(metadata["source_page"])
        lines = [line.strip(" \t-*#") for line in user_input.splitlines() if line.strip()]
        candidates = []
        signals = (
            "必须",
            "应当",
            "不得",
            "不接受",
            "未提供",
            "否决",
            "无效",
            "提供",
            "提交",
            "限价",
            "截止",
            "不少于",
            "不超过",
            "应一致",
            "统一为",
            "须",
            "完成交付",
            "质保期",
            "投标有效期",
        )
        for index, line in enumerate(lines):
            if len(line) < 6 or not any(token in line for token in signals):
                continue
            disqual = any(
                token in line for token in ("否决", "无效", "废标", "不接受", "不得参与", "未提供")
            )
            advisory = any(
                token in line
                for token in ("建议", "可酌情", "宜提供", "可提供", "可提交", "可选择", "无需提供")
            )
            imperative = any(token in line for token in ("提供", "提交")) and not advisory
            mandatory = disqual or imperative or any(
                token in line
                for token in (
                    "必须",
                    "应当",
                    "不得",
                    "须",
                    "不少于",
                    "不超过",
                    "应一致",
                    "统一为",
                    "完成交付",
                    "质保期",
                    "投标有效期",
                )
            )
            confidence = 0.94 if disqual else (0.86 if mandatory else 0.68)
            category = self._category(line)
            clause = None
            match = re.match(r"([\d一二三四五六七八九十]+(?:[.、]\d+)*)", line)
            if match:
                clause = match.group(1)
            candidates.append(
                {
                    "requirement_code": f"P{source_page:03d}-R{index + 1:03d}",
                    "category": category,
                    "title": line[:60],
                    "normalized_requirement": line,
                    "original_text": line,
                    "mandatory": mandatory,
                    "disqualification_if_failed": disqual,
                    "expected_evidence_types": self._evidence_types(line),
                    "clause_number": clause,
                    "source_page": source_page,
                    "source_bbox": None,
                    "confidence": confidence,
                    "prompt_version": metadata["prompt_version"],
                    "manual_review_reason": "低置信度候选，需人工确认"
                    if confidence < 0.70
                    else None,
                }
            )
        return output_schema.model_validate({"results": candidates})

    @staticmethod
    def _category(text: str) -> str:
        if any(x in text for x in ("价格", "报价", "限价", "金额")):
            return "pricing"
        if any(x in text for x in ("项目负责人", "人员", "从业经验", "社保", "简历")):
            return "personnel"
        if any(x in text for x in ("案例", "业绩", "验收证明")):
            return "case"
        if any(x in text for x in ("资质", "证书", "资格", "营业执照")):
            return "qualification"
        if any(x in text for x in ("签章", "盖章", "签字")):
            return "signature"
        if any(x in text for x in ("PDF", "格式", "文件大小", "MB", "页数")):
            return "format"
        if any(x in text for x in ("递交", "截止", "投标文件", "送达")):
            return "submission"
        if any(x in text for x in ("交付", "工期", "实施周期", "日期")):
            return "delivery"
        if any(x in text for x in ("质保", "运维", "售后", "服务期")):
            return "service"
        if any(x in text for x in ("安全", "保密", "等保", "密码")):
            return "security"
        if any(x in text for x in ("技术", "参数", "性能")):
            return "technical"
        if any(x in text for x in ("主体名称", "法定名称", "法律", "授权委托")):
            return "legal"
        if any(x in text for x in ("税率", "付款", "合同条件", "商务", "投标有效期")):
            return "commercial"
        return "other"

    @staticmethod
    def _evidence_types(text: str) -> list[str]:
        result = []
        if "营业执照" in text:
            result.append("business_license")
        if "证书" in text or "资质" in text:
            result.append("qualification_certificate")
        if "ISO" in text.upper():
            result.append("iso_certificate")
        if "验收" in text:
            result.append("acceptance_report")
        elif "案例" in text or "业绩" in text:
            result.extend(("contract", "acceptance_report"))
        if any(token in text for token in ("项目负责人", "人员", "经验", "简历")):
            result.extend(("staff_certificate", "resume"))
        return list(dict.fromkeys(result))


class OpenAICompatibleProvider:
    """Small JSON-schema adapter for an explicitly configured OpenAI-compatible endpoint."""

    name = "openai_compatible"

    def __init__(self, *, base_url: str, api_key: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    async def structured_generate(
        self,
        *,
        system_prompt: str,
        user_input: str,
        output_schema: type[T],
        metadata: dict,
    ) -> T:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            parsed = json.loads(content) if isinstance(content, str) else content
            return output_schema.model_validate(parsed)
        except (httpx.HTTPError, KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            raise ProviderUnavailableError(f"OpenAI-compatible provider failed: {exc}") from exc


def get_requirement_provider(provider_name: str | None = None) -> LLMProvider:
    """Return an explicitly approved provider for requirement extraction.

    Live providers deliberately have no implicit implementation or credential lookup here.
    A future adapter must be registered after explicit credential approval, schema validation,
    source-evidence handling, and an auditable policy review.
    """
    selected = (provider_name or os.getenv("BIDEVIDENCE_LLM_PROVIDER") or "mock").strip().lower()
    if selected == "mock":
        return MockLLMProvider()
    if selected == "openai_compatible":
        base_url = os.getenv("BIDEVIDENCE_LLM_BASE_URL")
        api_key = os.getenv("BIDEVIDENCE_LLM_API_KEY")
        model = os.getenv("BIDEVIDENCE_LLM_MODEL")
        if not base_url or not api_key or not model:
            raise ProviderUnavailableError(
                "openai_compatible requires BIDEVIDENCE_LLM_BASE_URL, "
                "BIDEVIDENCE_LLM_API_KEY, and BIDEVIDENCE_LLM_MODEL"
            )
        return OpenAICompatibleProvider(base_url=base_url, api_key=api_key, model=model)
    raise ProviderUnavailableError(
        f"provider '{selected}' is not approved for local execution; use mock or register an approved adapter"
    )
