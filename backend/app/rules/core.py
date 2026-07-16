from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path


@dataclass(frozen=True)
class RuleResult:
    code: str
    result: str
    expected: str
    actual: str
    reason: str


def date_not_after(value: date | datetime, deadline: date | datetime) -> RuleResult:
    actual = value.date() if isinstance(value, datetime) else value
    expected = deadline.date() if isinstance(deadline, datetime) else deadline
    passed = actual <= expected
    return RuleResult(
        "DATE_NOT_AFTER",
        "pass" if passed else "fail",
        str(expected),
        str(actual),
        "日期在截止日内" if passed else "日期晚于截止日",
    )


def amount_not_exceed(actual: Decimal, maximum: Decimal) -> RuleResult:
    passed = actual <= maximum
    return RuleResult(
        "AMOUNT_MAX",
        "pass" if passed else "fail",
        str(maximum),
        str(actual),
        "金额未超过上限" if passed else "金额超过上限",
    )


def certificate_valid(expiry: date | None, as_of: date) -> RuleResult:
    if expiry is None:
        return RuleResult("CERT_EXPIRY", "manual_review", f">={as_of}", "missing", "缺少证书有效期")
    passed = expiry >= as_of
    return RuleResult(
        "CERT_EXPIRY",
        "pass" if passed else "fail",
        f">={as_of}",
        str(expiry),
        "证书有效" if passed else "证书已过期",
    )


def normalize_legal_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).strip().lower()
    return re.sub(r"[\s()（）\-_,，。.]", "", value)


def legal_name_match(expected: str, actual: str) -> RuleResult:
    passed = normalize_legal_name(expected) == normalize_legal_name(actual)
    return RuleResult(
        "LEGAL_NAME",
        "pass" if passed else "fail",
        expected,
        actual,
        "主体名称一致" if passed else "主体名称不一致",
    )


def filename_matches(filename: str, pattern: str, allowed_extensions: set[str]) -> RuleResult:
    extension_ok = Path(filename).suffix.lower() in allowed_extensions
    pattern_ok = re.fullmatch(pattern, filename) is not None
    passed = extension_ok and pattern_ok
    return RuleResult(
        "FILENAME",
        "pass" if passed else "fail",
        pattern,
        filename,
        "文件名符合规则" if passed else "文件名或扩展名不符合规则",
    )


def hash_matches(data: bytes, expected_sha256: str) -> RuleResult:
    actual = hashlib.sha256(data).hexdigest()
    passed = actual.lower() == expected_sha256.lower()
    return RuleResult(
        "SHA256",
        "pass" if passed else "fail",
        expected_sha256,
        actual,
        "哈希一致" if passed else "哈希不一致",
    )


def minimum_value(actual: Decimal, minimum: Decimal, code: str = "MINIMUM") -> RuleResult:
    passed = actual >= minimum
    return RuleResult(
        code,
        "pass" if passed else "fail",
        f">={minimum}",
        str(actual),
        "达到最低要求" if passed else "低于最低要求",
    )


def maximum_value(actual: Decimal, maximum: Decimal, code: str = "MAXIMUM") -> RuleResult:
    passed = actual <= maximum
    return RuleResult(
        code,
        "pass" if passed else "fail",
        f"<={maximum}",
        str(actual),
        "未超过最高要求" if passed else "超过最高要求",
    )


def equal_rate(actual: Decimal, expected: Decimal) -> RuleResult:
    passed = actual == expected
    return RuleResult(
        "TAX_RATE",
        "pass" if passed else "fail",
        f"{expected}%",
        f"{actual}%",
        "税率一致" if passed else "税率不一致",
    )


CHINESE_DIGITS = {
    "零": 0,
    "壹": 1,
    "贰": 2,
    "叁": 3,
    "肆": 4,
    "伍": 5,
    "陆": 6,
    "柒": 7,
    "捌": 8,
    "玖": 9,
}
CHINESE_UNITS = {"拾": 10, "佰": 100, "仟": 1000}


def chinese_uppercase_yuan(value: str) -> Decimal:
    text = value.replace("元整", "").replace("圆整", "")
    total = Decimal(0)
    section_texts = text.split("万")
    for section_index, section in enumerate(section_texts):
        subtotal = 0
        current = 0
        for char in section:
            if char in CHINESE_DIGITS:
                current = CHINESE_DIGITS[char]
            elif char in CHINESE_UNITS:
                subtotal += (current or 1) * CHINESE_UNITS[char]
                current = 0
        subtotal += current
        multiplier = 10_000 if section_index < len(section_texts) - 1 else 1
        total += Decimal(subtotal * multiplier)
    return total


def uppercase_amount_matches(numeric: Decimal, uppercase: str) -> RuleResult:
    actual = chinese_uppercase_yuan(uppercase)
    passed = actual == numeric
    return RuleResult(
        "UPPERCASE_AMOUNT",
        "pass" if passed else "fail",
        str(numeric),
        str(actual),
        "大小写金额一致" if passed else "大小写金额不一致",
    )
