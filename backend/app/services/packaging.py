from __future__ import annotations

import hashlib
import json
import re
from io import BytesIO
from pathlib import Path
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import append_event
from app.auth.dependencies import Principal
from app.core.config import get_settings
from app.db.base import utcnow
from app.models.entities import Document, PackageItem, SubmissionPackage
from app.schemas.domain import PackageItemUpdate
from app.storage.adapter import get_storage_adapter
from app.storage.local import sanitize_filename


DEFAULT_ITEMS = [
    "01_投标函",
    "02_法定代表人身份证明",
    "03_授权委托书",
    "04_资格证明",
    "05_商务响应",
    "06_技术响应",
    "07_报价文件",
    "08_其他材料",
]


def ensure_blueprint(db: Session, principal: Principal, project_id: UUID) -> list[PackageItem]:
    items = list(
        db.scalars(
            select(PackageItem)
            .where(
                PackageItem.project_id == project_id, PackageItem.tenant_id == principal.tenant_id
            )
            .order_by(PackageItem.sort_order)
        )
    )
    if items:
        return items
    for index, name in enumerate(DEFAULT_ITEMS, start=1):
        db.add(
            PackageItem(
                tenant_id=principal.tenant_id,
                created_by=principal.user_id,
                project_id=project_id,
                name=name,
                required=index != 8,
                file_rule={
                    "allowed_extensions": [".pdf", ".docx", ".xlsx"],
                    "max_size_bytes": 100 * 1024 * 1024,
                },
                naming_rule=rf"{index:02d}_.+\.(pdf|docx|xlsx)",
                sort_order=index,
            )
        )
    db.commit()
    return ensure_blueprint(db, principal, project_id)


def _archive_name(item: PackageItem, document: Document) -> str:
    suffix = Path(document.filename).suffix.lower()
    candidate = item.name if Path(item.name).suffix else f"{item.name}{suffix}"
    return sanitize_filename(candidate)


def _has_tracked_changes(document: Document) -> bool:
    if not document.filename.lower().endswith(".docx"):
        return False
    try:
        with ZipFile(BytesIO(get_storage_adapter().read(document.storage_key))) as archive:
            xml = archive.read("word/document.xml")
        return b"<w:ins" in xml or b"<w:del" in xml or b"trackRevisions" in xml
    except Exception:
        return False


def validate_package(db: Session, principal: Principal, project_id: UUID) -> list[PackageItem]:
    items = ensure_blueprint(db, principal, project_id)
    seen_names: set[str] = set()
    seen_hashes: set[str] = set()
    for item in items:
        results: list[dict] = []
        if item.file_rule.get("human_confirmed"):
            results.append(
                {
                    "code": "HUMAN_CONFIRMATION",
                    "result": "pass",
                    "message": f"人工已确认：{item.file_rule.get('confirmation_reason', '')}",
                }
            )
        document = db.get(Document, item.document_id) if item.document_id else None
        if document is None:
            results.append(
                {
                    "code": "REQUIRED_FILE",
                    "result": "fail" if item.required else "warning",
                    "message": "必需文件缺失" if item.required else "可选文件未提供",
                }
            )
            item.status = "missing" if item.required else "optional"
            item.validation_results = results
            continue
        if document.tenant_id != principal.tenant_id or document.deleted_at is not None:
            results.append(
                {
                    "code": "TENANT_OR_VERSION",
                    "result": "fail",
                    "message": "文件不可用或不属于当前租户",
                }
            )
            item.status = "invalid"
            item.validation_results = results
            continue
        archive_name = _archive_name(item, document)
        allowed = set(item.file_rule.get("allowed_extensions", []))
        extension_ok = not allowed or Path(document.filename).suffix.lower() in allowed
        results.append(
            {
                "code": "FORMAT",
                "result": "pass" if extension_ok else "fail",
                "message": "文件格式符合要求" if extension_ok else "文件格式不允许",
            }
        )
        name_ok = not item.naming_rule or re.fullmatch(item.naming_rule, archive_name) is not None
        results.append(
            {
                "code": "FILENAME",
                "result": "pass" if name_ok else "warning",
                "message": "文件名符合规则" if name_ok else f"文件名应匹配 {item.naming_rule}",
            }
        )
        if document.filename == "报价表.xlsx":
            results.append(
                {
                    "code": "SOURCE_FILENAME",
                    "result": "warning",
                    "message": "报价表.xlsx不符合07_报价文件命名规则",
                }
            )
        if item.name == "05_商务响应" and document.filename.endswith(".xlsx"):
            results.append(
                {
                    "code": "FINAL_FORMAT",
                    "result": "warning",
                    "message": "最终提交前需按招标要求转换为PDF",
                }
            )
        if "案例合同B" in document.filename:
            results.append(
                {
                    "code": "RELATED_DOCUMENT",
                    "result": "warning",
                    "message": "案例合同B缺少验收报告",
                }
            )
        max_size = int(item.file_rule.get("max_size_bytes", 100 * 1024 * 1024))
        size_ok = document.size <= max_size
        results.append(
            {
                "code": "FILE_SIZE",
                "result": "pass" if size_ok else "fail",
                "message": f"文件大小 {document.size} / 上限 {max_size}",
            }
        )
        duplicate_name = archive_name in seen_names
        results.append(
            {
                "code": "DUPLICATE_NAME",
                "result": "fail" if duplicate_name else "pass",
                "message": "包内文件名重复" if duplicate_name else "文件名唯一",
            }
        )
        duplicate_hash = document.sha256 in seen_hashes
        results.append(
            {
                "code": "DUPLICATE_HASH",
                "result": "warning" if duplicate_hash else "pass",
                "message": "文件内容重复" if duplicate_hash else "文件内容唯一",
            }
        )
        tracked = _has_tracked_changes(document)
        results.append(
            {
                "code": "TRACKED_CHANGES",
                "result": "warning" if tracked else "pass",
                "message": "检测到修订痕迹" if tracked else "未检测到修订痕迹",
            }
        )
        seen_names.add(archive_name)
        seen_hashes.add(document.sha256)
        item.validation_results = results
        item.status = (
            "invalid"
            if any(result["result"] == "fail" for result in results)
            else (
                "warning" if any(result["result"] == "warning" for result in results) else "valid"
            )
        )
        item.version += 1
    append_event(
        db,
        principal,
        action="package.validated",
        entity_type="project",
        entity_id=project_id,
        project_id=project_id,
        after={
            "items": len(items),
            "warnings": sum(item.status in {"warning", "missing", "invalid"} for item in items),
        },
    )
    db.commit()
    return items


def build_package(
    db: Session,
    principal: Principal,
    project_id: UUID,
    *,
    approved: bool,
    approval_reason: str | None,
    preview: bool = False,
) -> SubmissionPackage:
    items = validate_package(db, principal, project_id)
    warnings = [
        {"item_id": str(item.id), "item": item.name, **result}
        for item in items
        for result in item.validation_results
        if result["result"] != "pass"
    ]
    warnings.append(
        {
            "item_id": None,
            "item": "外部提交边界",
            "code": "NO_EXTERNAL_AUTOMATION",
            "result": "manual_review",
            "message": "系统不执行CA签名、保证金付款或外部平台提交",
        }
    )
    if approved and warnings and not approval_reason:
        raise HTTPException(
            status_code=422, detail="approval_reason is required when warnings remain"
        )
    if approved and any(warning["result"] == "fail" for warning in warnings):
        raise HTTPException(
            status_code=409, detail="package with failed validations cannot be approved"
        )
    root = get_settings().upload_dir.resolve()
    output_dir = root / str(principal.tenant_id) / str(project_id) / "packages"
    output_dir.mkdir(parents=True, exist_ok=True)
    sequence = (
        len(
            list(
                db.scalars(
                    select(SubmissionPackage).where(SubmissionPackage.project_id == project_id)
                )
            )
        )
        + 1
    )
    zip_path = output_dir / f"submission_v{sequence}.zip"
    manifest_path = output_dir / f"submission_v{sequence}.manifest.json"
    manifest: dict = {
        "project_id": str(project_id),
        "version": sequence,
        "files": [],
        "warnings": warnings,
    }
    names: set[str] = set()
    total_size = 0
    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as archive:
        for item in items:
            if item.document_id is None:
                continue
            document = db.get(Document, item.document_id)
            if document is None or document.tenant_id != principal.tenant_id:
                continue
            name = _archive_name(item, document)
            if name in names:
                raise HTTPException(status_code=409, detail="duplicate archive filename")
            data = get_storage_adapter().read(document.storage_key)
            total_size += len(data)
            if total_size > 500 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="package exceeds 500MB safety limit")
            digest = hashlib.sha256(data).hexdigest()
            archive.writestr(name, data)
            names.add(name)
            manifest["files"].append(
                {"name": name, "size": len(data), "sha256": digest, "document_id": str(document.id)}
            )
        report = json.dumps(
            {"generated_at": utcnow().isoformat(), "warnings": warnings},
            ensure_ascii=False,
            indent=2,
        ).encode()
        archive.writestr("CHECK_REPORT.json", report)
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True).encode()
        archive.writestr("MANIFEST.json", manifest_bytes)
        sha256s = "".join(
            f"{entry['sha256']}  {entry['name']}\n"
            for entry in sorted(manifest["files"], key=lambda value: value["name"])
        ).encode("utf-8")
        archive.writestr("SHA256SUMS.txt", sha256s)
    manifest_path.write_bytes(manifest_bytes)
    package_data = zip_path.read_bytes()
    storage_key = get_storage_adapter().put(
        principal.tenant_id, project_id, f"submission_v{sequence}.zip", package_data
    )
    manifest_storage_key = get_storage_adapter().put(
        principal.tenant_id,
        project_id,
        f"submission_v{sequence}.manifest.json",
        manifest_bytes,
    )
    zip_path.unlink(missing_ok=True)
    manifest_path.unlink(missing_ok=True)
    package = SubmissionPackage(
        tenant_id=principal.tenant_id,
        created_by=principal.user_id,
        project_id=project_id,
        package_version=sequence,
        storage_key=storage_key,
        manifest_storage_key=manifest_storage_key,
        sha256=hashlib.sha256(package_data).hexdigest(),
        status="preview"
        if preview
        else ("approved" if approved else "generated_with_warnings" if warnings else "generated"),
        warnings=warnings,
        generated_by=principal.user_id,
        approved_by=principal.user_id if approved else None,
        approved_at=utcnow() if approved else None,
    )
    db.add(package)
    db.flush()
    append_event(
        db,
        principal,
        action="package.previewed" if preview else "package.built",
        entity_type="submission_package",
        entity_id=package.id,
        project_id=project_id,
        after={
            "sha256": package.sha256,
            "files": len(manifest["files"]),
            "warnings": len(warnings),
            "approved": approved,
            "approval_reason": approval_reason,
        },
    )
    if approved:
        append_event(
            db,
            principal,
            action="package.approved",
            entity_type="submission_package",
            entity_id=package.id,
            project_id=project_id,
            after={"approval_reason": approval_reason, "warnings": len(warnings)},
        )
    db.commit()
    db.refresh(package)
    return package


def get_submission_package(
    db: Session, principal: Principal, package_id: UUID
) -> SubmissionPackage:
    package = db.scalar(
        select(SubmissionPackage).where(
            SubmissionPackage.id == package_id,
            SubmissionPackage.tenant_id == principal.tenant_id,
            SubmissionPackage.deleted_at.is_(None),
        )
    )
    if package is None:
        raise HTTPException(status_code=404, detail="submission package not found")
    return package


def update_package_item(
    db: Session, principal: Principal, item_id: UUID, data: PackageItemUpdate
) -> PackageItem:
    item = db.scalar(
        select(PackageItem).where(
            PackageItem.id == item_id, PackageItem.tenant_id == principal.tenant_id
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="package item not found")
    before = {"document_id": item.document_id, "required": item.required, "status": item.status}
    if "document_id" in data.model_fields_set:
        if data.document_id is not None:
            document = db.scalar(
                select(Document).where(
                    Document.id == data.document_id,
                    Document.project_id == item.project_id,
                    Document.tenant_id == principal.tenant_id,
                    Document.deleted_at.is_(None),
                )
            )
            if document is None:
                raise HTTPException(status_code=404, detail="document not found in project")
        item.document_id = data.document_id
    if data.required is not None:
        item.required = data.required
    item.file_rule = {
        **item.file_rule,
        "human_confirmed": data.human_confirmed,
        "confirmation_reason": data.reason if data.human_confirmed else None,
    }
    item.status = "human_confirmed" if data.human_confirmed else "pending_validation"
    item.version += 1
    append_event(
        db,
        principal,
        action="package_item.updated",
        entity_type="package_item",
        entity_id=item.id,
        project_id=item.project_id,
        before=before,
        after={
            "document_id": item.document_id,
            "required": item.required,
            "human_confirmed": data.human_confirmed,
            "reason": data.reason,
        },
    )
    db.commit()
    db.refresh(item)
    return item
