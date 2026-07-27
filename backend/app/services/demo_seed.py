from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import (
    Amendment,
    AmendmentChange,
    AmendmentImpact,
    ComplianceCheck,
    ConsistencyIssue,
    DisqualificationRule,
    Document,
    DocumentPage,
    EvidenceAsset,
    EvidenceClaim,
    EvidenceMatch,
    PackageItem,
    RemediationTask,
    Requirement,
    ResponseItem,
    TenderProject,
    User,
)
from app.parsers.deterministic import DeterministicTextParser
from app.auth.dependencies import Principal
from app.services.responses import generate_project_responses
from app.storage.adapter import get_storage_adapter


def stable_id(key: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"bidevidence-demo:{key}")


def _date(value: str | None):
    return date.fromisoformat(value) if value else None


def _mime(path: Path) -> str:
    return {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }[path.suffix.lower()]


def _document_type(relative: str) -> str:
    if relative.startswith("amendments/"):
        return "amendment"
    if relative.startswith("evidence/"):
        return "enterprise_evidence"
    if relative.startswith("bid_documents/"):
        return "bid_response"
    return "tender_attachment" if "附件" in relative else "tender_main"


def seed_full_demo(db: Session, tenant_id: UUID, user_id: UUID, project_id: UUID) -> dict:
    root = Path(__file__).resolve().parents[3]
    fixture_path = root / "demo" / "expected_results" / "expected_results.json"
    manifest_path = root / "demo" / "expected_results" / "generated_manifest.json"
    if not fixture_path.exists() or not manifest_path.exists():
        return {"fixture_loaded": False}
    fixture = json.loads(fixture_path.read_text("utf-8"))
    manifest = json.loads(manifest_path.read_text("utf-8"))
    project = db.get(TenderProject, project_id)
    if project:
        project.deadline = datetime.fromisoformat(fixture["project"]["deadline"])
        project.current_stage = "remediation"
        project.status = "review_required"
        project.risk_level = "high"
        project.completion_percentage = 68
    users = {
        "USER-ADMIN": user_id,
        "USER-REVIEWER": stable_id("USER-REVIEWER"),
        "USER-BID-MANAGER": stable_id("USER-BID-MANAGER"),
    }
    for key, name, email, role in [
        ("USER-REVIEWER", "演示复核人", "reviewer@demo.local", "reviewer"),
        ("USER-BID-MANAGER", "演示投标经理", "manager@demo.local", "bid_manager"),
    ]:
        if db.get(User, users[key]) is None:
            db.add(
                User(id=users[key], organization_id=tenant_id, name=name, email=email, role=role)
            )
    db.flush()

    documents: dict[str, Document] = {}
    for entry in manifest["files"]:
        relative = entry["path"]
        path = root / "demo" / relative
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != entry["sha256"]:
            raise ValueError(f"demo file hash mismatch: {relative}")
        document = db.scalar(
            select(Document).where(Document.project_id == project_id, Document.sha256 == digest)
        )
        if document is None:
            storage_key = get_storage_adapter().put(tenant_id, project_id, path.name, data)
            document = Document(
                id=stable_id(f"DOC:{relative}"),
                tenant_id=tenant_id,
                created_by=user_id,
                uploaded_by=user_id,
                project_id=project_id,
                document_type=_document_type(relative),
                filename=path.name,
                storage_key=storage_key,
                mime_type=_mime(path),
                size=len(data),
                sha256=digest,
                parse_status="completed",
                page_count=1,
            )
            db.add(document)
            db.flush()
            pages = (
                DeterministicTextParser().parse(data, document.mime_type)
                if path.suffix.lower() in {".pdf", ".docx"}
                else []
            )
            if not pages:
                pages = [
                    type(
                        "Page",
                        (),
                        {
                            "page_number": 1,
                            "raw_text": "[结构化表格演示文件]",
                            "layout_json": {"adapter": "spreadsheet-fixture"},
                            "ocr_used": False,
                        },
                    )()
                ]
            document.page_count = len(pages)
            for page in pages:
                db.add(
                    DocumentPage(
                        id=stable_id(f"PAGE:{relative}:{page.page_number}"),
                        tenant_id=tenant_id,
                        created_by=user_id,
                        document_id=document.id,
                        page_number=page.page_number,
                        raw_text=page.raw_text,
                        markdown=page.raw_text,
                        layout_json=page.layout_json,
                        ocr_used=page.ocr_used,
                    )
                )
        documents[path.name] = document
    db.flush()

    requirements: dict[str, Requirement] = {}
    for spec in fixture["requirements"]:
        code = spec["code"]
        requirement = db.scalar(
            select(Requirement).where(
                Requirement.project_id == project_id, Requirement.requirement_code == code
            )
        )
        source = spec["source"]
        document = documents[source["file"]]
        if requirement is None:
            original = spec["title"]
            requirement = Requirement(
                id=stable_id(code),
                tenant_id=tenant_id,
                created_by=user_id,
                project_id=project_id,
                requirement_code=code,
                category=spec["category"],
                title=spec["title"],
                normalized_requirement=spec["title"],
                original_text=original,
                original_hash=hashlib.sha256(original.encode()).hexdigest(),
                mandatory=spec["mandatory"],
                disqualification_if_failed=spec["disqualification_if_failed"],
                risk_level="fatal" if spec["disqualification_if_failed"] else "high",
                source_document_id=document.id,
                source_page=source["page"],
                clause_number=source.get("clause"),
                extraction_confidence=spec["confidence"],
                review_status=spec["expected_status"],
                human_verified=True,
            )
            db.add(requirement)
            db.flush()
        requirements[code] = requirement
    for spec in fixture["disqualification_candidates"]:
        requirement = requirements[spec["requirement_code"]]
        if (
            db.scalar(
                select(DisqualificationRule).where(
                    DisqualificationRule.requirement_id == requirement.id
                )
            )
            is None
        ):
            db.add(
                DisqualificationRule(
                    id=stable_id(f"DISQ:{spec['requirement_code']}"),
                    tenant_id=tenant_id,
                    created_by=user_id,
                    requirement_id=requirement.id,
                    trigger_type="fixture_rule",
                    trigger_description=spec["trigger"],
                    severity=spec["severity"],
                    detected_keywords=[spec["trigger"]],
                    deterministic_rule="DISQUAL_DEMO_V1",
                    decision="candidate",
                )
            )
    db.flush()

    assets: dict[str, EvidenceAsset] = {}
    claims: dict[str, EvidenceClaim] = {}
    for spec in fixture["evidence_assets"]:
        asset = db.get(EvidenceAsset, stable_id(spec["key"]))
        if asset is None:
            asset = EvidenceAsset(
                id=stable_id(spec["key"]),
                tenant_id=tenant_id,
                organization_id=tenant_id,
                created_by=user_id,
                name=spec["name"],
                evidence_type=spec["evidence_type"],
                legal_entity=spec["legal_entity"],
                document_id=documents[spec["filename"]].id,
                effective_date=_date(spec.get("effective_date")),
                expiry_date=_date(spec.get("expiry_date")),
                status=spec["status"],
                owner_id=user_id,
                sensitivity=spec["sensitivity"],
                tags=spec["tags"],
                reviewed_at=datetime.fromisoformat(fixture["time_anchor"]),
                reviewed_by=user_id,
            )
            db.add(asset)
        assets[spec["key"]] = asset
        db.flush()
        for claim_spec in spec["claims"]:
            claim = db.get(EvidenceClaim, stable_id(claim_spec["key"]))
            if claim is None:
                claim = EvidenceClaim(
                    id=stable_id(claim_spec["key"]),
                    tenant_id=tenant_id,
                    created_by=user_id,
                    evidence_asset_id=asset.id,
                    claim_type=claim_spec["claim_type"],
                    subject=claim_spec["subject"],
                    predicate=claim_spec["predicate"],
                    value=claim_spec["value"],
                    unit=claim_spec.get("unit"),
                    valid_from=_date(claim_spec.get("valid_from")),
                    valid_to=_date(claim_spec.get("valid_to")),
                    source_page=claim_spec["source_page"],
                    source_text=claim_spec["source_text"],
                    extraction_confidence=claim_spec["confidence"],
                    human_verified=claim_spec["human_verified"],
                )
                db.add(claim)
            claims[claim_spec["key"]] = claim
    db.flush()

    matches: dict[str, EvidenceMatch] = {}
    for spec in fixture["evidence_matches"]:
        match = db.get(EvidenceMatch, stable_id(spec["key"]))
        if match is None:
            match = EvidenceMatch(
                id=stable_id(spec["key"]),
                tenant_id=tenant_id,
                created_by=user_id,
                requirement_id=requirements[spec["requirement_code"]].id,
                evidence_claim_id=claims[spec["claim_key"]].id,
                match_score=spec["match_score"],
                match_type=spec["match_type"],
                status=spec["status"],
                reason=spec["reason"],
                created_by_ai=False,
                human_decision=spec.get("human_decision"),
                human_reason="演示数据中的已复核决定" if spec.get("human_decision") else None,
            )
            db.add(match)
        matches[spec["key"]] = match
    db.flush()

    checks: dict[str, ComplianceCheck] = {}
    for spec in fixture["compliance_checks"]:
        check = db.get(ComplianceCheck, stable_id(spec["key"]))
        if check is None:
            check = ComplianceCheck(
                id=stable_id(spec["key"]),
                tenant_id=tenant_id,
                created_by=user_id,
                project_id=project_id,
                requirement_id=requirements[spec["requirement_code"]].id,
                check_type=spec["check_type"],
                expected=spec["expected"],
                actual=spec["actual"],
                result=spec["result"],
                severity=spec["severity"],
                rule_code=spec["rule_code"],
                reason=spec["reason"],
                source_references=spec["source_references"],
            )
            db.add(check)
        checks[spec["key"]] = check
    issues: dict[str, ConsistencyIssue] = {}
    for spec in fixture["consistency_issues"]:
        issue = db.get(ConsistencyIssue, stable_id(spec["key"]))
        if issue is None:
            refs = [item["source"] for item in spec["values_found"]]
            issue = ConsistencyIssue(
                id=stable_id(spec["key"]),
                tenant_id=tenant_id,
                created_by=user_id,
                project_id=project_id,
                issue_code=spec["code"],
                issue_type=spec["issue_type"],
                entity_key=spec["entity_key"],
                field_name=spec["field_name"],
                values_found=spec["values_found"],
                document_references=refs,
                severity=spec["severity"],
                status=spec["status"],
                resolution=f"建议值：{spec['suggested_value']}"
                if spec.get("suggested_value")
                else None,
            )
            db.add(issue)
        issues[spec["key"]] = issue
    db.flush()

    changes: dict[str, AmendmentChange] = {}
    for amend_spec in fixture["amendments"]:
        amendment = db.get(Amendment, stable_id(amend_spec["key"]))
        if amendment is None:
            amendment = Amendment(
                id=stable_id(amend_spec["key"]),
                tenant_id=tenant_id,
                created_by=user_id,
                project_id=project_id,
                document_id=documents[amend_spec["filename"]].id,
                effective_date=_date(amend_spec["effective_date"]),
                summary=amend_spec["summary"],
                analysis_status=amend_spec["analysis_status"],
            )
            db.add(amendment)
            db.flush()
        for change_spec in amend_spec["changes"]:
            change = db.get(AmendmentChange, stable_id(change_spec["key"]))
            if change is None:
                source_page_num = int(change_spec["source"].rsplit(":", 1)[1])
                affected = change_spec.get("affected_requirement_codes", [])
                change = AmendmentChange(
                    id=stable_id(change_spec["key"]),
                    tenant_id=tenant_id,
                    created_by=user_id,
                    amendment_id=amendment.id,
                    change_type=change_spec["type"],
                    old_requirement_id=requirements[affected[0]].id if affected else None,
                    old_text=change_spec.get("old"),
                    new_text=change_spec.get("new"),
                    old_value=change_spec.get("old"),
                    new_value=change_spec.get("new"),
                    source_page=source_page_num,
                    severity="high",
                )
                db.add(change)
            changes[change_spec["key"]] = change
    db.flush()

    package_items: dict[str, PackageItem] = {}
    package_spec = fixture["package"]
    for index, item_spec in enumerate(package_spec["items"], start=1):
        item = db.get(PackageItem, stable_id(item_spec["key"]))
        document = documents.get(item_spec.get("document_filename"))
        allowed = [f".{ext}" for ext in item_spec["allowed_extensions"]]
        naming = item_spec["naming_rule"].replace(".{ext}", r"\.(pdf|docx|xlsx)")
        if item is None:
            item = PackageItem(
                id=stable_id(item_spec["key"]),
                tenant_id=tenant_id,
                created_by=user_id,
                project_id=project_id,
                parent_id=stable_id(item_spec["parent_key"])
                if item_spec.get("parent_key")
                else None,
                name=item_spec["name"],
                required=item_spec["required"],
                file_rule={
                    "allowed_extensions": allowed,
                    "max_size_bytes": item_spec["max_size_bytes"],
                },
                naming_rule=naming,
                sort_order=index,
                document_id=document.id if document else None,
                status=item_spec["status"],
                validation_results=[],
            )
            db.add(item)
        package_items[item_spec["key"]] = item
    db.flush()

    tasks: dict[str, RemediationTask] = {}
    anchor = datetime.fromisoformat(fixture["time_anchor"])
    validation_sources = {
        validation["key"]: package_items.get(validation.get("package_item_key"))
        for validation in package_spec["expected_validations"]
    }
    for spec in fixture["remediation_tasks"]:
        task = db.get(RemediationTask, stable_id(spec["key"]))
        source = None
        if spec["source_type"] == "compliance_check":
            source = checks.get(spec["source_key"])
        elif spec["source_type"] == "consistency_issue":
            source = issues.get(spec["source_key"])
        elif spec["source_type"] == "amendment_change":
            source = changes.get(spec["source_key"])
        elif spec["source_type"] == "package_validation":
            source = validation_sources.get(spec["source_key"])
        if task is None:
            task = RemediationTask(
                id=stable_id(spec["key"]),
                tenant_id=tenant_id,
                created_by=user_id,
                project_id=project_id,
                source_type=spec["source_type"],
                source_id=source.id if source else project_id,
                title=spec["title"],
                description=spec["description"],
                priority=spec["priority"],
                status=spec["status"],
                assignee_id=users.get(spec.get("assignee_key")),
                due_at=anchor + timedelta(days=spec["due_offset_days"]),
                reviewer_id=users.get(spec.get("reviewer_key")),
            )
            db.add(task)
        tasks[spec["key"]] = task
    db.flush()

    for amend_spec in fixture["amendments"]:
        for change_spec in amend_spec["changes"]:
            change = changes[change_spec["key"]]
            for index, impact_spec in enumerate(change_spec["impacts"]):
                impact_id = stable_id(f"IMPACT:{change_spec['key']}:{index}")
                if db.get(AmendmentImpact, impact_id):
                    continue
                target_key = impact_spec["target_key"]
                db.add(
                    AmendmentImpact(
                        id=impact_id,
                        tenant_id=tenant_id,
                        created_by=user_id,
                        amendment_change_id=change.id,
                        affected_requirement_id=requirements[target_key].id
                        if target_key in requirements
                        else None,
                        affected_evidence_id=assets[target_key].id
                        if target_key in assets
                        else None,
                        affected_task_id=tasks[target_key].id if target_key in tasks else None,
                        affected_package_item_id=package_items[target_key].id
                        if target_key in package_items
                        else None,
                        impact_description=impact_spec["description"],
                        requires_reapproval=impact_spec["requires_reapproval"],
                        status="open",
                    )
                )
    db.commit()
    existing_response = db.scalar(
        select(ResponseItem.id).where(
            ResponseItem.project_id == project_id,
            ResponseItem.tenant_id == tenant_id,
        )
    )
    if existing_response is None:
        generate_project_responses(
            db,
            Principal(tenant_id=tenant_id, user_id=user_id, role="admin"),
            project_id,
            allow_provisional=False,
        )
    return {
        "fixture_loaded": True,
        "documents": len(documents),
        "requirements": len(requirements),
        "evidence_assets": len(assets),
        "claims": len(claims),
        "matches": len(matches),
        "checks": len(checks),
        "issues": len(issues),
        "tasks": len(tasks),
        "package_items": len(package_items),
        "responses": db.query(ResponseItem).filter(
            ResponseItem.project_id == project_id,
            ResponseItem.tenant_id == tenant_id,
        ).count(),
    }
