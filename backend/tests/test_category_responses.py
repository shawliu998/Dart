from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from app.models.entities import EvidenceClaim, Requirement
from app.services.responses import _deterministic_category_draft


def _requirement(category: str) -> Requirement:
    return Requirement(
        id=uuid4(),
        title=f"{category} 要求",
        category=category,
        normalized_requirement=f"完成 {category} 条款的具体要求",
    )


def test_category_fallbacks_are_structurally_distinct_and_conservative() -> None:
    drafts = {
        category: _deterministic_category_draft(
            _requirement(category), [], allow_provisional=True
        )
        for category in ("qualification", "technical", "commercial", "delivery")
    }
    assert len({item.strategy for item in drafts.values()}) == 4
    assert "资质或证书" in drafts["qualification"].text
    assert "关键参数" in drafts["technical"].text
    assert "合同条件" in drafts["commercial"].text
    assert "关键节点" in drafts["delivery"].text
    assert drafts["qualification"].status == "missing_evidence"
    assert drafts["technical"].status == "needs_review"
    for draft in drafts.values():
        assert "我方完全满足" not in draft.text
        assert "我方予以响应" not in draft.text
        assert draft.risk_notes


def test_qualification_fallback_uses_claim_value_page_and_validity() -> None:
    claim = EvidenceClaim(
        claim_type="certification",
        subject="测试科技有限公司",
        predicate="持有认证",
        value="ISO/IEC 27001",
        valid_to=None,
        source_page=2,
        source_text="证书：ISO/IEC 27001",
        extraction_confidence=Decimal("0.920"),
        human_verified=False,
    )
    draft = _deterministic_category_draft(
        _requirement("qualification"), [claim], allow_provisional=True
    )
    assert draft.status == "drafted"
    assert "ISO/IEC 27001" in draft.text
    assert "第2页" in draft.text
    assert "尚未人工接受" in "".join(draft.risk_notes)
