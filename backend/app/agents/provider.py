from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass
from time import perf_counter
from typing import Any, Protocol, TypeVar
from urllib.parse import urlsplit

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


@dataclass
class ProviderCallTrace:
    """Credential-free diagnostics for one OpenAI-compatible request."""

    request_config: dict[str, Any]
    raw_response: Any | None = None
    error: str | None = None
    latency_ms: int | None = None
    status_code: int | None = None
    usage: dict[str, Any] | None = None
    returned_model: str | None = None
    finish_reason: str | None = None

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _redact_sensitive(value: Any, secrets: tuple[str, ...]) -> Any:
    if isinstance(value, dict):
        redacted: dict[Any, Any] = {}
        for key, item in value.items():
            normalized_key = str(key).lower().replace("-", "_")
            if normalized_key in {
                "authorization",
                "api_key",
                "apikey",
                "x_api_key",
                "access_token",
                "refresh_token",
            }:
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = _redact_sensitive(item, secrets)
        return redacted
    if isinstance(value, list):
        return [_redact_sensitive(item, secrets) for item in value]
    if isinstance(value, tuple):
        return tuple(_redact_sensitive(item, secrets) for item in value)
    if isinstance(value, str):
        result = value
        for secret in secrets:
            if secret:
                result = result.replace(secret, "[REDACTED]")
        return re.sub(
            r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+",
            "Bearer [REDACTED]",
            result,
        )
    return value


def _contains_secret(value: Any, secrets: tuple[str, ...]) -> bool:
    active_secrets = tuple(secret for secret in secrets if secret)
    if isinstance(value, dict):
        return any(
            _contains_secret(key, active_secrets)
            or _contains_secret(item, active_secrets)
            for key, item in value.items()
        )
    if isinstance(value, (list, tuple)):
        return any(_contains_secret(item, active_secrets) for item in value)
    if isinstance(value, str):
        return any(secret in value for secret in active_secrets)
    return False


def build_structured_system_prompt(
    system_prompt: str,
    output_schema: type[BaseModel],
) -> str:
    schema_json = _canonical_json(output_schema.model_json_schema())
    return (
        f"{system_prompt.rstrip()}\n\n"
        "只返回一个有效 JSON 对象，不要返回 Markdown、代码围栏或解释文字。"
        "JSON 对象必须严格符合下面的 JSON Schema；"
        "无法确定的候选也必须使用 Schema 允许的字段表达并进入人工复核。\n"
        '最小 JSON 输出示例：{"results":[]}。\n'
        f"JSON Schema:\n{schema_json}"
    )


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

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        max_tokens: int = 4096,
        timeout_seconds: float = 60,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not 256 <= max_tokens <= 16384:
            raise ValueError("max_tokens must be between 256 and 16384")
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        parsed_base_url = urlsplit(base_url)
        if parsed_base_url.scheme not in {"http", "https"} or not parsed_base_url.netloc:
            raise ValueError("base_url must be an absolute HTTP(S) URL")
        if (
            parsed_base_url.username
            or parsed_base_url.password
            or parsed_base_url.query
            or parsed_base_url.fragment
        ):
            raise ValueError("base_url must not contain credentials, query, or fragment")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.timeout_seconds = timeout_seconds
        self._transport = transport
        self.last_call_trace: ProviderCallTrace | None = None

    async def structured_generate(
        self,
        *,
        system_prompt: str,
        user_input: str,
        output_schema: type[T],
        metadata: dict,
    ) -> T:
        schema = output_schema.model_json_schema()
        schema_json = _canonical_json(schema)
        structured_system_prompt = build_structured_system_prompt(
            system_prompt,
            output_schema,
        )
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": structured_system_prompt},
                {"role": "user", "content": user_input},
            ],
            "temperature": 0,
            "max_tokens": self.max_tokens,
            "response_format": {"type": "json_object"},
        }
        endpoint = f"{self.base_url}/chat/completions"
        trace = ProviderCallTrace(
            request_config={
                "endpoint": _redact_sensitive(endpoint, (self.api_key,)),
                "model": _redact_sensitive(self.model, (self.api_key,)),
                "temperature": 0,
                "max_tokens": self.max_tokens,
                "timeout_seconds": self.timeout_seconds,
                "response_format": payload["response_format"],
                "output_schema": output_schema.__name__,
                "schema_sha256": _sha256_text(schema_json),
                "system_prompt_sha256": _sha256_text(structured_system_prompt),
                "user_input_sha256": _sha256_text(user_input),
                "prompt_version": metadata.get("prompt_version"),
                "source_page": metadata.get("source_page"),
            }
        )
        self.last_call_trace = trace
        started = perf_counter()
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds,
                transport=self._transport,
            ) as client:
                response = await client.post(
                    endpoint,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
            trace.status_code = response.status_code
            try:
                raw_response: Any = response.json()
            except json.JSONDecodeError:
                raw_response = response.text
            trace.raw_response = _redact_sensitive(raw_response, (self.api_key,))
            response.raise_for_status()
            if not isinstance(raw_response, dict):
                raise TypeError("provider response must be a JSON object")
            choice = raw_response["choices"][0]
            trace.usage = _redact_sensitive(
                raw_response.get("usage"),
                (self.api_key,),
            )
            trace.returned_model = _redact_sensitive(
                raw_response.get("model"),
                (self.api_key,),
            )
            trace.finish_reason = _redact_sensitive(
                choice.get("finish_reason"),
                (self.api_key,),
            )
            content = choice["message"]["content"]
            parsed = json.loads(content) if isinstance(content, str) else content
            validated = output_schema.model_validate(parsed)
            if _contains_secret(
                validated.model_dump(mode="json"),
                (self.api_key,),
            ):
                raise ValueError("provider output contained a configured credential")
            return validated
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            redacted_error = _redact_sensitive(
                f"{type(exc).__name__}: {exc}",
                (self.api_key,),
            )
            trace.error = redacted_error
            raise ProviderUnavailableError(
                f"OpenAI-compatible provider failed: {redacted_error}"
            ) from None
        finally:
            trace.latency_ms = round((perf_counter() - started) * 1000)


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
        raw_max_tokens = os.getenv("BIDEVIDENCE_LLM_MAX_TOKENS", "4096")
        try:
            max_tokens = int(raw_max_tokens)
        except ValueError as exc:
            raise ProviderUnavailableError(
                "BIDEVIDENCE_LLM_MAX_TOKENS must be an integer"
            ) from exc
        try:
            return OpenAICompatibleProvider(
                base_url=base_url,
                api_key=api_key,
                model=model,
                max_tokens=max_tokens,
            )
        except ValueError as exc:
            raise ProviderUnavailableError(str(exc)) from exc
    raise ProviderUnavailableError(
        f"provider '{selected}' is not approved for local execution; use mock or register an approved adapter"
    )
