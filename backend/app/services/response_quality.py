"""Deterministic quality checks for internal response drafts.

This service is intentionally conservative.  It diagnoses draft quality but
only repairs two labels that can be derived without new facts: the internal
draft warning and an explicit marker based on an already-persisted
``missing_information`` value.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import Principal
from app.models.entities import ResponseEvidenceLink, ResponseItem


INTERNAL_DRAFT_MARKER = "内部草稿，未经最终人工确认。"
_PLACEHOLDER_PATTERN = re.compile(r"\{\{[^{}]+\}\}|\$\{[^{}]+\}|\[\[[^\[\]]+\]\]")
_GENERIC_PHRASES = ("我方响应", "按要求执行", "完全满足", "予以响应")
IssueCode = Literal[
    "empty_draft",
    "draft_too_short",
    "missing_evidence_link",
    "unresolved_template_placeholder",
    "missing_information",
    "missing_information_state",
    "generic_wording",
    "missing_internal_draft_marker",
]


class ResponseQualityIssue(BaseModel):
    response_item_id: UUID
    code: IssueCode
    severity: Literal["low", "medium", "high"]
    repairable: bool
    manual_review: bool
    before_summary: str
    after_summary: str | None = None


class ResponseQualityPass(BaseModel):
    pass_number: int = Field(ge=1, le=2)
    issues: list[ResponseQualityIssue] = Field(default_factory=list)
    repaired_count: int = Field(ge=0)
    before_summary: str
    after_summary: str


class ResponseQualityResult(BaseModel):
    passes: list[ResponseQualityPass] = Field(default_factory=list, max_length=2)
    before_summary: str
    after_summary: str
    issue_count: int = Field(ge=0)
    observed_issue_count: int = Field(ge=0)
    repaired_count: int = Field(ge=0)
    manual_review_required: bool
    review_href: str


def _summary(items: Iterable[ResponseItem]) -> str:
    materialized = list(items)
    return (
        f"共 {len(materialized)} 条响应草稿；"
        f"缺证据 {sum(item.status == 'missing_evidence' for item in materialized)} 条；"
        f"待补充 {sum(bool(item.missing_information) for item in materialized)} 条；"
        f"内部草稿标识 {sum(_has_internal_marker(item) for item in materialized)} 条；"
        f"显式待补充标识 {sum(bool(_missing_marker(item)) and _missing_marker(item) in (item.draft_text or '') for item in materialized)} 条。"
    )


def _is_human_or_approved(item: ResponseItem) -> bool:
    return item.status == "approved" or item.reviewed_by is not None or item.edited_text is not None


def _has_internal_marker(item: ResponseItem) -> bool:
    return INTERNAL_DRAFT_MARKER in (item.risk_notes or [])


def _missing_marker(item: ResponseItem) -> str:
    values = "；".join(str(value).strip() for value in item.missing_information if str(value).strip())
    return f"【待补充：{values}】" if values else ""


def _inspect_item(item: ResponseItem, evidence_link_count: int) -> list[ResponseQualityIssue]:
    text = (item.draft_text or "").strip()
    summary = f"状态={item.status}；草稿长度={len(text)}；证据链接={evidence_link_count}。"
    mutable = not _is_human_or_approved(item)
    issues: list[ResponseQualityIssue] = []
    if not text:
        issues.append(ResponseQualityIssue(
            response_item_id=item.id, code="empty_draft", severity="high", repairable=False,
            manual_review=True, before_summary=summary,
        ))
    elif len(text) < 24:
        issues.append(ResponseQualityIssue(
            response_item_id=item.id, code="draft_too_short", severity="medium", repairable=False,
            manual_review=True, before_summary=summary,
        ))
    if evidence_link_count == 0:
        issues.append(ResponseQualityIssue(
            response_item_id=item.id, code="missing_evidence_link", severity="high", repairable=False,
            manual_review=True, before_summary=summary,
        ))
    if _PLACEHOLDER_PATTERN.search(text):
        issues.append(ResponseQualityIssue(
            response_item_id=item.id, code="unresolved_template_placeholder", severity="high",
            repairable=False, manual_review=True, before_summary=summary,
        ))
    if item.missing_information:
        marker = _missing_marker(item)
        issues.append(ResponseQualityIssue(
            response_item_id=item.id, code="missing_information", severity="high",
            repairable=bool(marker) and marker not in text and mutable,
            manual_review=True, before_summary=summary,
        ))
    if (item.status == "missing_evidence") != bool(item.missing_information):
        issues.append(ResponseQualityIssue(
            response_item_id=item.id, code="missing_information_state", severity="high",
            repairable=False, manual_review=True, before_summary=summary,
        ))
    if any(phrase in text for phrase in _GENERIC_PHRASES) and evidence_link_count == 0:
        issues.append(ResponseQualityIssue(
            response_item_id=item.id, code="generic_wording", severity="medium", repairable=False,
            manual_review=True, before_summary=summary,
        ))
    if not _has_internal_marker(item):
        issues.append(ResponseQualityIssue(
            response_item_id=item.id, code="missing_internal_draft_marker", severity="low",
            repairable=mutable, manual_review=True, before_summary=summary,
        ))
    return issues


def _safe_repairs(item: ResponseItem, issues: list[ResponseQualityIssue]) -> int:
    """Make only label changes allowed for an untouched internal draft."""
    if _is_human_or_approved(item):
        return 0
    repaired = 0
    repair_codes = {issue.code for issue in issues if issue.repairable}
    if "missing_information" in repair_codes:
        marker = _missing_marker(item)
        text = (item.draft_text or "").strip()
        if marker and marker not in text:
            item.draft_text = f"{text}\n{marker}".strip()
            repaired += 1
    if "missing_internal_draft_marker" in repair_codes and not _has_internal_marker(item):
        item.risk_notes = [*(item.risk_notes or []), INTERNAL_DRAFT_MARKER]
        repaired += 1
    if repaired:
        item.version += 1
    return repaired


def run_response_quality_checks(
    db: Session,
    principal: Principal,
    project_id: UUID,
    *,
    max_passes: int = 2,
) -> ResponseQualityResult:
    """Inspect and safely label internal drafts, for at most two deterministic passes.

    No provider is invoked and no claims, dates, amounts, legal conclusions, or
    human/approved states are created or changed.
    """
    pass_limit = min(max(1, max_passes), 2)
    items = list(db.scalars(select(ResponseItem).where(
        ResponseItem.project_id == project_id,
        ResponseItem.tenant_id == principal.tenant_id,
    ).order_by(ResponseItem.created_at)))
    initial_summary = _summary(items)
    passes: list[ResponseQualityPass] = []
    observed_issues = total_repairs = 0
    for pass_number in range(1, pass_limit + 1):
        link_rows = db.execute(
            select(ResponseEvidenceLink.response_item_id, func.count(ResponseEvidenceLink.id))
            .where(ResponseEvidenceLink.tenant_id == principal.tenant_id)
            .group_by(ResponseEvidenceLink.response_item_id)
        ).tuples()
        links_by_response: dict[UUID, int] = {
            response_item_id: int(link_count)
            for response_item_id, link_count in link_rows
        }
        issues_by_item = {
            item.id: _inspect_item(item, int(links_by_response.get(item.id, 0))) for item in items
        }
        issues = [issue for item_issues in issues_by_item.values() for issue in item_issues]
        repaired = sum(_safe_repairs(item, issues_by_item[item.id]) for item in items)
        after_summary = _summary(items)
        for issue in issues:
            issue.after_summary = after_summary
        passes.append(ResponseQualityPass(
            pass_number=pass_number,
            issues=issues,
            repaired_count=repaired,
            before_summary=initial_summary if pass_number == 1 else passes[-1].after_summary,
            after_summary=after_summary,
        ))
        observed_issues += len(issues)
        total_repairs += repaired
        if repaired == 0:
            break
        db.flush()
    remaining_issues = passes[-1].issues if passes else []
    return ResponseQualityResult(
        passes=passes,
        before_summary=initial_summary,
        after_summary=_summary(items),
        issue_count=len(remaining_issues),
        observed_issue_count=observed_issues,
        repaired_count=total_repairs,
        manual_review_required=any(issue.manual_review for issue in remaining_issues),
        review_href=f"/projects/{project_id}/review",
    )
