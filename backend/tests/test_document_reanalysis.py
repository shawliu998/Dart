from __future__ import annotations

import asyncio
import time
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import select

from app.auth.dependencies import Principal
from app.db.session import SessionLocal
from app.models.entities import AsyncJob, Document, DocumentPage, Requirement
from app.schemas.requirements import RequirementBatch
from app.services import documents, jobs, reanalysis


def _wait_for_job(client, headers: dict[str, str], job_id: str) -> dict:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        response = client.get(f"/api/jobs/{job_id}", headers=headers)
        assert response.status_code == 200, response.text
        job = response.json()
        if job["status"] in {"completed", "failed", "cancelled"}:
            return job
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not finish before timeout")


def _parsed_document(client, demo) -> tuple[str, str]:
    headers = demo["auth_headers"]
    created = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "原子重分析测试",
            "project_code": f"REANALYZE-{uuid4().hex[:8]}",
            "buyer_name": "测试采购人",
        },
    )
    project_id = created.json()["id"]
    pdf_path = Path(__file__).resolve().parents[2] / "demo" / "tender" / "招标文件.pdf"
    with pdf_path.open("rb") as pdf:
        uploaded = client.post(
            f"/api/projects/{project_id}/documents",
            headers=headers,
            data={"document_type": "tender_main"},
            files={"file": (pdf_path.name, pdf, "application/pdf")},
        )
    document_id = uploaded.json()["id"]
    parsed = client.post(f"/api/documents/{document_id}/parse", headers=headers)
    assert parsed.status_code == 202, parsed.text
    parsed_job = _wait_for_job(client, headers, parsed.json()["id"])
    assert parsed_job["status"] == "completed", parsed_job
    extracted = client.post(
        f"/api/projects/{project_id}/requirements/extract",
        headers=headers,
        json={"document_id": document_id},
    )
    assert extracted.status_code == 202
    extracted_job = _wait_for_job(client, headers, extracted.json()["id"])
    assert extracted_job["status"] == "completed", extracted_job
    return project_id, document_id


def test_document_reanalysis_atomically_switches_current_requirements(client, demo) -> None:
    project_id, document_id = _parsed_document(client, demo)
    with SessionLocal() as db:
        old_requirements = list(
            db.scalars(
                select(Requirement).where(
                    Requirement.source_document_id == UUID(document_id),
                    Requirement.is_current.is_(True),
                )
            )
        )
        assert old_requirements
        old_ids = {item.id for item in old_requirements}
        old_page_text = db.scalar(
            select(DocumentPage.raw_text).where(
                DocumentPage.document_id == UUID(document_id),
                DocumentPage.parse_revision == 1,
                DocumentPage.page_number == 1,
            )
        )

    response = client.post(f"/api/documents/{document_id}/reanalyze", headers=demo["auth_headers"])
    assert response.status_code == 202, response.text
    job = _wait_for_job(client, demo["auth_headers"], response.json()["id"])
    assert job["status"] == "completed", job

    with SessionLocal() as db:
        document = db.get(Document, UUID(document_id))
        assert document is not None and document.parse_revision == 2
        old_rows = list(db.scalars(select(Requirement).where(Requirement.id.in_(old_ids))))
        new_rows = list(
            db.scalars(
                select(Requirement).where(
                    Requirement.source_document_id == UUID(document_id),
                    Requirement.is_current.is_(True),
                )
            )
        )
        assert old_rows and all(not item.is_current and item.superseded_at for item in old_rows)
        assert new_rows and all(item.extraction_revision == 2 for item in new_rows)
        assert {item.id for item in new_rows}.isdisjoint(old_ids)
        assert db.scalar(
            select(DocumentPage).where(
                DocumentPage.document_id == UUID(document_id),
                DocumentPage.parse_revision == 1,
            )
        ) is not None
        assert db.scalar(
            select(DocumentPage).where(
                DocumentPage.document_id == UUID(document_id),
                DocumentPage.parse_revision == 2,
            )
        ) is not None

    historical_page = client.get(
        f"/api/documents/{document_id}/pages/1?revision=1", headers=demo["auth_headers"]
    )
    current_page = client.get(f"/api/documents/{document_id}/pages/1", headers=demo["auth_headers"])
    assert historical_page.status_code == current_page.status_code == 200
    assert historical_page.json()["parse_revision"] == 1
    assert current_page.json()["parse_revision"] == 2
    assert historical_page.json()["raw_text"] == old_page_text


def test_document_reanalysis_failure_keeps_existing_pages_and_requirements(client, demo, monkeypatch) -> None:
    _, document_id = _parsed_document(client, demo)
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]), user_id=UUID(demo["user_id"]), role="admin"
    )
    with SessionLocal() as db:
        document = db.get(Document, UUID(document_id))
        assert document is not None
        old_revision = document.parse_revision
        old_pages = [item.raw_text for item in db.scalars(select(DocumentPage).where(DocumentPage.document_id == document.id))]
        old_ids = set(
            db.scalars(
                select(Requirement.id).where(
                    Requirement.source_document_id == document.id,
                    Requirement.is_current.is_(True),
                )
            )
        )
        job = reanalysis.create_reanalysis_job(db, principal, document)

    class EmptyProvider:
        name = "empty"
        model = "empty"

        async def structured_generate(self, **_kwargs):
            return RequirementBatch(results=[])

    monkeypatch.setattr(
        reanalysis,
        "get_requirement_provider",
        lambda **_: EmptyProvider(),
    )
    asyncio.run(reanalysis.run_document_reanalysis_job(job.id, principal))

    with SessionLocal() as db:
        document = db.get(Document, UUID(document_id))
        failed_job = db.get(AsyncJob, job.id)
        assert document is not None and document.parse_revision == old_revision
        assert failed_job is not None and failed_job.status == "failed"
        assert [item.raw_text for item in db.scalars(select(DocumentPage).where(DocumentPage.document_id == document.id))] == old_pages
        assert set(
            db.scalars(
                select(Requirement.id).where(
                    Requirement.source_document_id == document.id,
                    Requirement.is_current.is_(True),
                )
            )
        ) == old_ids


def test_document_reanalysis_rejects_active_parse_or_extraction_job(client, demo) -> None:
    _, document_id = _parsed_document(client, demo)
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]), user_id=UUID(demo["user_id"]), role="admin"
    )
    with SessionLocal() as db:
        documents.create_job(db, principal, job_type="document_parse", entity_id=UUID(document_id))

    response = client.post(f"/api/documents/{document_id}/reanalyze", headers=demo["auth_headers"])
    assert response.status_code == 409


def test_document_reanalysis_does_not_publish_after_lease_loss(client, demo) -> None:
    _, document_id = _parsed_document(client, demo)
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]), user_id=UUID(demo["user_id"]), role="admin"
    )
    with SessionLocal() as db:
        document = db.get(Document, UUID(document_id))
        assert document is not None
        base_revision = document.parse_revision
        job = reanalysis.create_reanalysis_job(db, principal, document)
        job.status = "running"
        job.lease_owner = "worker-old"
        db.commit()

    asyncio.run(
        reanalysis.run_document_reanalysis_job(
            job.id,
            principal,
            worker_id="worker-old",
            lease_valid=lambda: False,
        )
    )

    with SessionLocal() as db:
        document = db.get(Document, UUID(document_id))
        stale_job = db.get(AsyncJob, job.id)
        assert document is not None and document.parse_revision == base_revision
        assert stale_job is not None and stale_job.status == "running"
        assert stale_job.error == "document reanalysis lease was lost"


def test_document_reanalysis_cancellation_stops_before_publish(client, demo) -> None:
    _, document_id = _parsed_document(client, demo)
    principal = Principal(
        tenant_id=UUID(demo["tenant_id"]), user_id=UUID(demo["user_id"]), role="admin"
    )
    with SessionLocal() as db:
        document = db.get(Document, UUID(document_id))
        assert document is not None
        base_revision = document.parse_revision
        job = reanalysis.create_reanalysis_job(db, principal, document)
        job.status = "running"
        job.lease_owner = "worker-cancel"
        job.cancel_requested = True
        db.commit()

    asyncio.run(
        reanalysis.run_document_reanalysis_job(
            job.id,
            principal,
            worker_id="worker-cancel",
            lease_valid=lambda: True,
        )
    )
    assert jobs._finish_claim(job.id, "worker-cancel", False) is True

    with SessionLocal() as db:
        document = db.get(Document, UUID(document_id))
        cancelled_job = db.get(AsyncJob, job.id)
        assert document is not None and document.parse_revision == base_revision
        assert cancelled_job is not None and cancelled_job.status == "cancelled"
