from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.entities import EvidenceMatch, Requirement, ResponseItem


def _draft_response(demo: dict) -> str:
    tenant_id = UUID(demo["tenant_id"])
    user_id = UUID(demo["user_id"])
    project_id = UUID(demo["project_id"])
    with SessionLocal() as db:
        requirement = db.scalar(
            select(Requirement).where(
                Requirement.project_id == project_id,
                Requirement.tenant_id == tenant_id,
                Requirement.requirement_code == "REQ-001",
            )
        )
        assert requirement is not None
        item = db.scalar(
            select(ResponseItem).where(
                ResponseItem.project_id == project_id,
                ResponseItem.requirement_id == requirement.id,
                ResponseItem.tenant_id == tenant_id,
            )
        )
        if item is None:
            item = ResponseItem(
                tenant_id=tenant_id,
                created_by=user_id,
                project_id=project_id,
                requirement_id=requirement.id,
            )
            db.add(item)
        item.status = "drafted"
        item.draft_text = "基于已确认材料的响应草稿。"
        item.confidence = Decimal("0.820")
        db.commit()
        return str(item.id)


def test_response_workbench_lists_edits_and_approves_with_audit(client, demo):
    headers = demo["auth_headers"]
    project_id = demo["project_id"]
    response_id = _draft_response(demo)

    listed = client.get(f"/api/projects/{project_id}/responses", headers=headers)
    assert listed.status_code == 200
    row = next(item for item in listed.json() if item["id"] == response_id)
    assert row["status"] == "drafted"
    assert row["evidence_claim_ids"]
    assert row["requirement"] is not None
    assert row["requirement_source"] is not None

    edited = client.patch(
        f"/api/responses/{response_id}",
        headers=headers,
        json={"edited_text": "经人工调整后的响应内容。", "reason": "补充项目实施说明"},
    )
    assert edited.status_code == 200
    assert edited.json()["status"] == "needs_review"
    assert edited.json()["edited_text"] == "经人工调整后的响应内容。"
    assert edited.json()["reviewed_by"] is None
    assert edited.json()["requirement_source"] is not None
    assert edited.json()["evidence_sources"]

    approved = client.post(
        f"/api/responses/{response_id}/approve",
        headers=headers,
        json={"reason": "复核后批准此响应"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["reviewed_by"] == demo["user_id"]
    assert approved.json()["requirement_source"] is not None
    assert approved.json()["evidence_sources"]


def test_demo_seed_creates_stable_source_bound_response_workbench_data(client, demo):
    headers = demo["auth_headers"]
    first = client.get(f"/api/projects/{demo['project_id']}/responses", headers=headers)
    assert first.status_code == 200
    rows = first.json()
    assert len(rows) == demo["requirements"]
    assert {"drafted", "needs_review", "missing_evidence"}.issubset(
        {row["status"] for row in rows}
    )
    license_response = next(row for row in rows if row["requirement"]["code"] == "REQ-001")
    assert license_response["requirement_source"] == {
        "document_id": license_response["requirement_source"]["document_id"],
        "filename": "招标文件.pdf",
        "version": 1,
        "page": 3,
        "clause": "3.1",
        "excerpt": "营业执照",
        "bbox": None,
    }
    assert license_response["evidence_sources"]
    assert "营业执照" in license_response["evidence_sources"][0]["asset_name"]
    missing = next(row for row in rows if row["requirement"]["code"] == "REQ-005")
    assert missing["status"] == "missing_evidence"
    assert missing["evidence_sources"] == []

    reseeded = client.post("/api/dev/seed", headers=headers)
    assert reseeded.status_code == 200
    second = client.get(f"/api/projects/{demo['project_id']}/responses", headers=headers)
    assert second.status_code == 200
    assert [(row["id"], row["version"], row["generation_version"]) for row in second.json()] == [
        (row["id"], row["version"], row["generation_version"]) for row in rows
    ]


def test_response_projection_preserves_source_nullability_contract(client, demo):
    listed = client.get(
        f"/api/projects/{demo['project_id']}/responses",
        headers=demo["auth_headers"],
    )
    assert listed.status_code == 200
    requirement_source = next(
        response["requirement_source"]
        for response in listed.json()
        if response["requirement_source"] is not None
    )
    evidence_source = next(
        source
        for response in listed.json()
        for source in response["evidence_sources"]
    )
    assert isinstance(requirement_source["page"], int)
    assert requirement_source["bbox"] is None or isinstance(requirement_source["bbox"], dict)
    assert isinstance(evidence_source["page"], int)
    assert isinstance(evidence_source["confidence"], float)


def test_response_projection_never_labels_provisional_matches_as_accepted(client, demo):
    with SessionLocal() as db:
        match = db.scalar(
            select(EvidenceMatch)
            .join(Requirement, Requirement.id == EvidenceMatch.requirement_id)
            .where(
                EvidenceMatch.tenant_id == UUID(demo["tenant_id"]),
                EvidenceMatch.status == "accepted",
                Requirement.requirement_code == "REQ-001",
            )
        )
        assert match is not None
        claim_id = str(match.evidence_claim_id)
        match.status = "provisional_match"
        db.commit()

    listed = client.get(
        f"/api/projects/{demo['project_id']}/responses",
        headers=demo["auth_headers"],
    )
    assert listed.status_code == 200
    row = next(item for item in listed.json() if item["requirement"]["code"] == "REQ-001")
    assert claim_id in row["evidence_claim_ids"]
    assert claim_id not in {source["claim_id"] for source in row["evidence_sources"]}


def test_response_workbench_enforces_tenant_and_reason(client, demo):
    response_id = _draft_response(demo)
    other_headers = {
        "X-Tenant-ID": str(uuid4()),
        "X-User-ID": demo["user_id"],
        "X-Role": "admin",
    }
    assert client.get(
        f"/api/projects/{demo['project_id']}/responses", headers=other_headers
    ).status_code == 404
    assert client.patch(
        f"/api/responses/{response_id}",
        headers=demo["auth_headers"],
        json={"edited_text": "缺少原因"},
    ).status_code == 422
    assert client.post(
        f"/api/responses/{response_id}/approve",
        headers=demo["auth_headers"],
        json={"reason": "可批准"},
    ).status_code == 200
