from datetime import date
from decimal import Decimal

import pytest

from app.rules.core import (
    amount_not_exceed,
    certificate_valid,
    date_not_after,
    filename_matches,
    hash_matches,
    legal_name_match,
    normalize_legal_name,
    minimum_value,
    maximum_value,
    equal_rate,
    uppercase_amount_matches,
)
from app.storage.local import sanitize_filename, sha256_bytes, validate_mime


def test_date_amount_and_certificate_rules_are_deterministic():
    assert date_not_after(date(2026, 7, 1), date(2026, 7, 2)).result == "pass"
    assert date_not_after(date(2026, 7, 3), date(2026, 7, 2)).result == "fail"
    assert amount_not_exceed(Decimal("5850000"), Decimal("5850000")).result == "pass"
    assert amount_not_exceed(Decimal("5850000.01"), Decimal("5850000")).result == "fail"
    assert certificate_valid(date(2025, 1, 1), date(2026, 1, 1)).result == "fail"
    assert certificate_valid(None, date(2026, 1, 1)).result == "manual_review"


def test_legal_name_filename_and_hash_rules():
    assert normalize_legal_name("上海（标证通） 科技有限公司") == "上海标证通科技有限公司"
    assert legal_name_match("上海标证通科技有限公司", "上海 标证通科技有限公司").result == "pass"
    assert legal_name_match("上海标证通科技有限公司", "上海标证通信息有限公司").result == "fail"
    assert filename_matches("01_投标函.pdf", r"\d{2}_.+\.pdf", {".pdf"}).result == "pass"
    data = b"immutable evidence"
    assert hash_matches(data, sha256_bytes(data)).result == "pass"


def test_upload_filename_and_mime_safety():
    with pytest.raises(ValueError):
        sanitize_filename("../../secret.pdf")
    with pytest.raises(ValueError):
        validate_mime("x.pdf", "application/pdf", b"not a pdf")
    assert sanitize_filename("招标 文件.pdf") == "招标_文件.pdf"


def test_count_year_delivery_warranty_rate_and_uppercase_amount_rules():
    assert minimum_value(Decimal("2"), Decimal("2"), "CASE_COUNT").result == "pass"
    assert minimum_value(Decimal("3"), Decimal("5"), "EXPERIENCE").result == "fail"
    assert maximum_value(Decimal("90"), Decimal("90"), "DELIVERY").result == "pass"
    assert minimum_value(Decimal("3"), Decimal("3"), "WARRANTY").result == "pass"
    assert equal_rate(Decimal("6"), Decimal("6")).result == "pass"
    assert uppercase_amount_matches(Decimal("5820000"), "伍佰捌拾贰万元整").result == "pass"
    assert uppercase_amount_matches(Decimal("5820000"), "伍佰捌拾万零贰仟元整").result == "fail"
