"""Durable, fixed-order P1 orchestration for tender requirement review."""

from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit.service import stable_hash
from app.auth.dependencies import Principal
from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models.entities import (
    AgentArtifact,
    AgentEvent,
    AgentRun,
    AgentStepRun,
    ApprovalRequest,
    AsyncJob,
    Document,
    Requirement,
)
from app.services.documents import create_job, run_parse_job
from app.services.extraction import run_extraction_job
from app.services.evidence import suggest_matches
from app.services.exports import export_project_artifacts
from app.services.projects import get_project
from app.services.responses import generate_project_responses
from app.services.review_workflows import run_compliance

WORKFLOW_TYPE = "bid_analysis_and_response_v1"
BID_WORKFLOW_STEPS: tuple[tuple[str, str], ...] = (
    ("ingest_documents", "接收与校验招标文件"),
    ("parse_documents", "解析文档并建立来源索引"),
    ("extract_project_profile", "提取项目摘要候选"),
    ("extract_requirements", "抽取招标要求候选"),
    ("review_requirements", "人工复核招标要求"),
    ("match_evidence", "生成企业证据候选"),
    ("review_evidence_matches", "人工复核证据匹配"),
    ("run_compliance_rules", "运行确定性合规检查"),
    ("draft_responses", "生成投标响应草稿"),
    ("review_responses", "人工复核投标响应"),
    ("export_artifacts", "导出交付物"),
)


def _event(db: Session, run: AgentRun, event_type: str, payload: dict, step: AgentStepRun | None = None) -> None:
    db.flush()
    sequence = (db.scalar(select(func.max(AgentEvent.sequence)).where(AgentEvent.run_id == run.id)) or 0) + 1
    db.add(AgentEvent(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id if step else None, event_type=event_type, sequence=sequence, payload=payload))
    db.flush()


def _steps(db: Session, run_id: UUID) -> list[AgentStepRun]:
    return list(db.scalars(select(AgentStepRun).where(AgentStepRun.run_id == run_id).order_by(AgentStepRun.sequence)))


def _bundle(db: Session, principal: Principal, run: AgentRun) -> dict:
    if run.tenant_id != principal.tenant_id:
        raise LookupError("agent run not found")
    return {
        "run": run,
        "steps": _steps(db, run.id),
        "approvals": list(db.scalars(select(ApprovalRequest).where(ApprovalRequest.run_id == run.id).order_by(ApprovalRequest.created_at))),
        "artifacts": list(db.scalars(select(AgentArtifact).where(AgentArtifact.run_id == run.id).order_by(AgentArtifact.created_at))),
    }


def get_run(db: Session, principal: Principal, run_id: UUID) -> dict:
    run = db.scalar(select(AgentRun).where(AgentRun.id == run_id, AgentRun.tenant_id == principal.tenant_id))
    if run is None:
        raise LookupError("agent run not found")
    return _bundle(db, principal, run)


def list_runs(db: Session, principal: Principal, project_id: UUID) -> list[dict]:
    get_project(db, principal, project_id)
    runs = db.scalars(select(AgentRun).where(AgentRun.project_id == project_id, AgentRun.tenant_id == principal.tenant_id).order_by(AgentRun.created_at.desc()))
    return [_bundle(db, principal, run) for run in runs]


def create_run(db: Session, principal: Principal, project_id: UUID, *, goal: str, input_revision: int) -> dict:
    get_project(db, principal, project_id)
    run = AgentRun(tenant_id=principal.tenant_id, project_id=project_id, workflow_type=WORKFLOW_TYPE, goal=goal, input_revision=input_revision, created_by=principal.user_id)
    db.add(run)
    db.flush()
    for sequence, (key, _title) in enumerate(BID_WORKFLOW_STEPS, start=1):
        db.add(AgentStepRun(tenant_id=principal.tenant_id, run_id=run.id, step_key=key, sequence=sequence, created_by=principal.user_id))
    db.flush()
    _event(db, run, "run.created", {"workflow_type": WORKFLOW_TYPE, "input_revision": input_revision})
    db.add(AsyncJob(tenant_id=principal.tenant_id, created_by=principal.user_id, job_type="agent_run", entity_id=run.id, input_revision=input_revision))
    db.commit()
    db.refresh(run)
    return _bundle(db, principal, run)


def _fail(db: Session, run: AgentRun, step: AgentStepRun, code: str, message: str) -> None:
    now = utcnow()
    step.status, step.error_code, step.error_message, step.completed_at = "failed", code, message, now
    run.status, run.error_code, run.error_message, run.completed_at = "failed", code, message, now
    _event(db, run, "step.failed", {"code": code, "message": message}, step)


def _complete(db: Session, run: AgentRun, step: AgentStepRun, payload: dict) -> None:
    step.status, step.completed_at, step.output_hash = "completed", utcnow(), stable_hash(payload)
    _event(db, run, "step.completed", payload, step)


def _request_approval(
    db: Session,
    run: AgentRun,
    step: AgentStepRun,
    *,
    approval_type: str,
    title: str,
    description: str,
    impact_summary: str,
) -> None:
    approval = db.scalar(
        select(ApprovalRequest).where(
            ApprovalRequest.step_run_id == step.id,
            ApprovalRequest.status == "pending",
        )
    )
    if approval is None:
        approval = ApprovalRequest(
            tenant_id=run.tenant_id,
            run_id=run.id,
            step_run_id=step.id,
            approval_type=approval_type,
            title=title,
            description=description,
            impact_summary=impact_summary,
            reversible=True,
            requested_role="reviewer",
            created_by=run.created_by,
        )
        db.add(approval)
    step.status, run.status = "waiting_approval", "waiting_approval"
    _event(db, run, "approval.requested", {"approval_type": approval_type}, step)


def process_agent_run(run_id: UUID) -> bool:
    """Run the durable P1 slice; any worker can resume queued runs from persisted steps."""
    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        if run is None or run.status in {"completed", "cancelled", "waiting_approval"}:
            return False
        principal = Principal(tenant_id=run.tenant_id, user_id=run.created_by, role="admin")
        run.status, run.started_at = "planning", run.started_at or utcnow()
        _event(db, run, "run.started", {})
        db.commit()
        try:
            for step in _steps(db, run.id):
                db.refresh(run)
                if run.cancel_requested:
                    step.status, run.status, run.completed_at = "cancelled", "cancelled", utcnow()
                    _event(db, run, "run.cancelled", {}, step)
                    db.commit()
                    return True
                if step.status == "completed":
                    continue
                run.status, run.current_step, step.status, step.started_at = "running", step.step_key, "running", utcnow()
                _event(db, run, "step.started", {"step_key": step.step_key}, step)
                db.commit()
                if step.step_key == "ingest_documents":
                    documents = list(db.scalars(select(Document).where(Document.project_id == run.project_id, Document.tenant_id == run.tenant_id, Document.deleted_at.is_(None))))
                    tender_main_count = sum(item.document_type == "tender_main" for item in documents)
                    if not tender_main_count:
                        _fail(db, run, step, "NO_TENDER_MAIN", "请先上传至少一份招标主文件")
                        db.commit()
                        return False
                    inventory = {
                        "document_count": len(documents),
                        "tender_main_count": tender_main_count,
                        "attachment_count": sum(item.document_type == "tender_attachment" for item in documents),
                        "amendment_count": sum(item.document_type == "amendment" for item in documents),
                    }
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="document_inventory", title="项目文件清单", storage_key=f"runtime://{run.id}/document-inventory", content_hash=stable_hash(inventory), metadata_json=inventory, created_by=principal.user_id))
                    _complete(db, run, step, inventory)
                elif step.step_key == "parse_documents":
                    documents = list(db.scalars(select(Document).where(Document.project_id == run.project_id, Document.tenant_id == run.tenant_id, Document.deleted_at.is_(None))))
                    for document in documents:
                        if document.parse_status != "completed":
                            job = create_job(db, principal, job_type="document_parse", entity_id=document.id)
                            run_parse_job(job.id, principal)
                    db.expire_all()
                    current_documents = list(db.scalars(select(Document).where(Document.project_id == run.project_id, Document.tenant_id == run.tenant_id, Document.deleted_at.is_(None))))
                    parsed = [item for item in current_documents if item.parse_status == "completed"]
                    failures = [item.filename for item in current_documents if item.parse_status != "completed"]
                    if any(item.document_type == "tender_main" and item.parse_status != "completed" for item in current_documents):
                        _fail(db, run, step, "TENDER_PARSE_FAILED", "招标主文件解析失败，无法继续分析")
                        db.commit()
                        return False
                    parse_summary = {"parsed_document_count": len(parsed), "total_page_count": sum(item.page_count for item in parsed), "ocr_required_count": 0, "failed_files": failures, "warning": "部分附件未解析，已跳过" if failures else None}
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="parse_summary", title="文件解析结果", storage_key=f"runtime://{run.id}/parse-summary", content_hash=stable_hash(parse_summary), metadata_json=parse_summary, created_by=principal.user_id))
                    _complete(db, run, step, parse_summary)
                elif step.step_key == "extract_project_profile":
                    project = get_project(db, principal, run.project_id)
                    profile = {"name": project.name, "buyer_name": project.buyer_name, "project_code": project.project_code, "deadline": project.deadline.isoformat() if project.deadline else None}
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="project_profile", title="项目摘要候选", storage_key=f"runtime://{run.id}/project-profile", content_hash=stable_hash(profile), metadata_json=profile, created_by=principal.user_id))
                    _complete(db, run, step, profile)
                elif step.step_key == "extract_requirements":
                    completed_documents = db.scalars(select(Document).where(Document.project_id == run.project_id, Document.tenant_id == run.tenant_id, Document.document_type.in_(("tender_main", "tender_attachment", "amendment")), Document.parse_status == "completed"))
                    for document in completed_documents:
                        job = create_job(db, principal, job_type="requirement_extraction", entity_id=document.id)
                        asyncio.run(run_extraction_job(job.id, principal))
                    count = db.scalar(select(func.count()).select_from(Requirement).where(Requirement.project_id == run.project_id, Requirement.tenant_id == run.tenant_id)) or 0
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="requirements", title="要求候选清单", storage_key=f"runtime://{run.id}/requirements", content_hash=stable_hash({"count": count}), metadata_json={"count": count, "review_state": "manual_review"}, created_by=principal.user_id))
                    _complete(db, run, step, {"requirement_count": count})
                elif step.step_key == "review_requirements":
                    _request_approval(db, run, step, approval_type="review_requirements", title="请复核招标要求", description="要求候选、来源和低置信度项必须由人工确认后再进入证据匹配。", impact_summary=f"/projects/{run.project_id}/requirements")
                    db.commit()
                    return True
                elif step.step_key == "match_evidence":
                    matches = suggest_matches(db, principal, run.project_id)
                    pending_count = sum(match.status in {"suggested", "needs_review"} for match in matches)
                    summary = {"count": pending_count, "summary": "已生成待人工决策的证据候选；不会自动接受或形成最终合规结论。", "href": f"/projects/{run.project_id}/evidence-matching", "severity": "info", "review_state": "manual_review"}
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="evidence_match_candidates", title="证据候选匹配", storage_key=f"runtime://{run.id}/evidence-match-candidates", content_hash=stable_hash(summary), metadata_json=summary, created_by=principal.user_id))
                    _complete(db, run, step, summary)
                elif step.step_key == "review_evidence_matches":
                    _request_approval(db, run, step, approval_type="review_evidence_matches", title="请复核证据匹配", description="候选证据必须逐条接受或拒绝；未接受的材料不会进入合规结论或响应草稿。", impact_summary=f"/projects/{run.project_id}/evidence-matching")
                    db.commit()
                    return True
                elif step.step_key == "run_compliance_rules":
                    checks = run_compliance(db, principal, run.project_id)
                    summary = {result: sum(check.result == result for check in checks) for result in ("pass", "warning", "fail", "manual_review")}
                    summary["href"] = f"/projects/{run.project_id}/evidence-matching"
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="compliance_summary", title="合规检查摘要", storage_key=f"runtime://{run.id}/compliance-summary", content_hash=stable_hash(summary), metadata_json=summary, created_by=principal.user_id))
                    _complete(db, run, step, summary)
                elif step.step_key == "draft_responses":
                    responses = generate_project_responses(db, principal, run.project_id)
                    summary = {"count": len(responses), "missing_evidence_count": sum(item.status == "missing_evidence" for item in responses), "href": f"/projects/{run.project_id}/responses"}
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="response_drafts", title="投标响应草稿", storage_key=f"runtime://{run.id}/response-drafts", content_hash=stable_hash(summary), metadata_json=summary, created_by=principal.user_id))
                    _complete(db, run, step, summary)
                elif step.step_key == "review_responses":
                    _request_approval(db, run, step, approval_type="review_responses", title="请复核投标响应", description="请编辑、补充或批准响应草稿；缺少材料的条款会明确保留待补充标记。", impact_summary=f"/projects/{run.project_id}/responses")
                    db.commit()
                    return True
                elif step.step_key == "export_artifacts":
                    exported = export_project_artifacts(db, principal, run.project_id)
                    for artifact in exported:
                        db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type=artifact["artifact_type"], title=artifact["title"], storage_key=artifact["storage_key"], content_hash=artifact["content_hash"], metadata_json=artifact["metadata"], created_by=principal.user_id))
                    _complete(db, run, step, {"count": len(exported), "artifacts": [item["artifact_type"] for item in exported]})
                db.commit()
            run.status, run.completed_at = "completed", utcnow()
            _event(db, run, "run.completed", {"workflow_type": WORKFLOW_TYPE})
            db.commit()
            return True
        except Exception as exc:
            db.rollback()
            run = db.get(AgentRun, run_id)
            if run is not None:
                step = next((item for item in _steps(db, run.id) if item.status == "running"), _steps(db, run.id)[-1])
                _fail(db, run, step, "RUNTIME_ERROR", str(exc)[:1000])
                db.commit()
            return False


def decide_approval(db: Session, principal: Principal, approval_id: UUID, *, approved: bool, reason: str) -> dict:
    approval = db.scalar(select(ApprovalRequest).where(ApprovalRequest.id == approval_id, ApprovalRequest.tenant_id == principal.tenant_id))
    if approval is None or approval.status != "pending":
        raise LookupError("pending approval not found")
    run = db.get(AgentRun, approval.run_id)
    step = db.get(AgentStepRun, approval.step_run_id)
    if run is None or step is None:
        raise LookupError("approval runtime not found")
    approval.status, approval.decision_reason, approval.decided_at = ("approved" if approved else "rejected"), reason, utcnow()
    if approved:
        _complete(db, run, step, {"approved": True, "reason": reason})
        run.status, run.completed_at = "queued", None
        db.add(AsyncJob(tenant_id=run.tenant_id, created_by=principal.user_id, job_type="agent_run", entity_id=run.id, input_revision=run.input_revision))
        _event(db, run, "run.resumed", {"approval_type": approval.approval_type, "reason": reason}, step)
    else:
        step.status, run.status, run.completed_at = "cancelled", "cancelled", utcnow()
        _event(db, run, "run.cancelled", {"reason": reason}, step)
    db.commit()
    return _bundle(db, principal, run)


def cancel_run(db: Session, principal: Principal, run_id: UUID) -> dict:
    data = get_run(db, principal, run_id)
    run: AgentRun = data["run"]
    run.cancel_requested = True
    if run.status in {"queued", "planning", "waiting_approval"}:
        run.status, run.completed_at = "cancelled", utcnow()
        _event(db, run, "run.cancelled", {})
    db.commit()
    return _bundle(db, principal, run)


def retry_run(db: Session, principal: Principal, run_id: UUID) -> dict:
    data = get_run(db, principal, run_id)
    run: AgentRun = data["run"]
    if run.status != "failed":
        raise ValueError("only failed runs may be retried")
    run.status, run.cancel_requested, run.error_code, run.error_message = "queued", False, None, None
    db.add(AsyncJob(tenant_id=run.tenant_id, created_by=principal.user_id, job_type="agent_run", entity_id=run.id, input_revision=run.input_revision))
    _event(db, run, "run.retry_requested", {})
    db.commit()
    return _bundle(db, principal, run)
