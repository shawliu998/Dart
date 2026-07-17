"""Deterministic, source-bound project profile candidates.

Tender files are untrusted input.  This module only recognises explicitly
labelled text and returns candidates for human review; it never updates a
``TenderProject`` and deliberately keeps deadline text as it appeared in the
source instead of parsing or calculating a date.
"""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import Principal
from app.models.entities import Document, DocumentPage, TenderProject


_FIELD_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "name": (
        re.compile(r"(?:招标项目名称|采购项目名称|项目名称)\s*[：:]\s*([^\r\n]{2,160})"),
    ),
    "buyer_name": (
        re.compile(r"(?:采购人|采购单位|招标人|招标单位)\s*[：:]\s*([^\r\n]{2,160})"),
    ),
    "project_code": (
        re.compile(r"(?:项目编号|采购编号|招标编号|项目编码)\s*[：:]\s*([^\s\r\n，。；;]{2,100})"),
    ),
    "deadline": (
        re.compile(
            r"(?:投标(?:文件)?(?:递交)?截止(?:时间)?|截止(?:时间|日期))\s*[：:]\s*([^\r\n]{4,160})"
        ),
    ),
}

_PROFILE_FIELDS = ("name", "buyer_name", "project_code", "deadline")


def _missing_candidate(field: str) -> dict[str, Any]:
    return {
        "field": field,
        "value": None,
        "document_id": None,
        "filename": None,
        "page": None,
        "excerpt": None,
        "confidence": 0.0,
        "review_state": "missing",
    }


def _excerpt(text: str, start: int, end: int) -> str:
    """Return a compact, source-faithful snippet without interpreting it."""
    compact = " ".join(text[max(0, start - 48) : min(len(text), end + 96)].split())
    return compact[:240]


def _value(match: re.Match[str]) -> str:
    return " ".join(match.group(1).strip().split()).rstrip("，。；;")


def build_project_profile_candidates(
    db: Session, principal: Principal, project_id: UUID
) -> dict[str, Any]:
    """Read labelled candidates from parsed tender-main pages without side effects.

    The returned object is suitable for an ``AgentArtifact.metadata_json``.
    Existing project fields are intentionally omitted: those are user-managed
    records, while this artifact is only a reviewable observation of source
    documents.
    """
    project = db.scalar(
        select(TenderProject).where(
            TenderProject.id == project_id,
            TenderProject.tenant_id == principal.tenant_id,
            TenderProject.deleted_at.is_(None),
        )
    )
    if project is None:
        raise LookupError("project not found")

    documents = list(
        db.scalars(
            select(Document)
            .where(
                Document.project_id == project.id,
                Document.tenant_id == principal.tenant_id,
                Document.document_type == "tender_main",
                Document.parse_status == "completed",
                Document.deleted_at.is_(None),
            )
            .order_by(Document.created_at, Document.id)
        )
    )
    candidates: dict[str, dict[str, Any]] = {
        field: _missing_candidate(field) for field in _PROFILE_FIELDS
    }

    for document in documents:
        pages = db.scalars(
            select(DocumentPage)
            .where(
                DocumentPage.document_id == document.id,
                DocumentPage.tenant_id == principal.tenant_id,
            )
            .order_by(DocumentPage.page_number)
        )
        for page in pages:
            # raw_text is untrusted data, used only as the input of these fixed
            # regular expressions; it is never executed or treated as an instruction.
            text = page.raw_text or ""
            for field, patterns in _FIELD_PATTERNS.items():
                if candidates[field]["review_state"] != "missing":
                    continue
                match = next(
                    (candidate for pattern in patterns if (candidate := pattern.search(text))),
                    None,
                )
                if match is None:
                    continue
                value = _value(match)
                if not value:
                    continue
                candidates[field] = {
                    "field": field,
                    "value": value,
                    "document_id": str(document.id),
                    "filename": document.filename,
                    "page": page.page_number,
                    "excerpt": _excerpt(text, match.start(), match.end()),
                    "confidence": 0.9,
                    "review_state": "manual_review",
                }

    return {
        "kind": "project_profile_candidates",
        "review_state": "manual_review",
        "source_document_type": "tender_main",
        "candidate_count": sum(item["review_state"] != "missing" for item in candidates.values()),
        "candidates": candidates,
    }
