"""Durable, fixed-order P1 orchestration for tender requirement review."""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy
from decimal import Decimal
from typing import Callable, Iterator
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit.service import stable_hash
from app.autonomous_agent import ToolResult, next_decision
from app.autonomous_agent.schemas import ToolName
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
    User,
)
from app.services.documents import create_job, run_parse_job
from app.services.extraction import run_extraction_job
from app.services.evidence import suggest_matches
from app.services.exports import export_project_artifacts
from app.services.project_profile import build_project_profile_candidates
from app.services.projects import get_project
from app.services.response_quality import run_response_quality_checks
from app.services.responses import generate_project_responses
from app.services.review_workflows import run_compliance

WORKFLOW_TYPE = "bid_analysis_and_response_v1"
_ACTIVE_AGENT_JOB_STATUSES = ("queued", "running", "retrying")
_agent_heartbeat: ContextVar[Callable[[], bool] | None] = ContextVar(
    "agent_run_heartbeat", default=None
)
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

_AUTONOMOUS_PLAN: tuple[tuple[str, str, set[str]], ...] = (
    ("understand", "理解项目与招标文件", {"ingest_documents", "parse_documents", "extract_project_profile", "extract_requirements"}),
    ("evidence", "匹配证据并运行检查", {"review_requirements", "match_evidence", "review_evidence_matches", "run_compliance_rules"}),
    ("draft", "生成内部响应草稿", {"draft_responses", "review_responses"}),
    ("deliver", "生成交付工作包", {"export_artifacts"}),
    ("review", "统一人工复核", set()),
)


@contextmanager
def agent_run_heartbeat(callback: Callable[[], bool]) -> Iterator[None]:
    """Bind a worker lease callback to this execution without global cross-talk."""
    token = _agent_heartbeat.set(callback)
    try:
        yield
    finally:
        _agent_heartbeat.reset(token)


def enqueue_agent_run_job(
    db: Session,
    run: AgentRun,
    *,
    created_by: UUID,
    immediate: bool = False,
) -> AsyncJob:
    """Return the sole active job for a run, creating one only when needed.

    The parent row lock serializes create/resume/retry in database deployments;
    SQLite still gets deterministic idempotency through the same query path.
    """
    db.flush()
    db.scalar(select(AgentRun.id).where(AgentRun.id == run.id).with_for_update())
    active = db.scalar(
        select(AsyncJob)
        .where(
            AsyncJob.tenant_id == run.tenant_id,
            AsyncJob.job_type == "agent_run",
            AsyncJob.entity_id == run.id,
            AsyncJob.status.in_(_ACTIVE_AGENT_JOB_STATUSES),
        )
        .order_by(AsyncJob.created_at)
        .limit(1)
    )
    if active is not None:
        # A manual retry makes an already scheduled automatic retry runnable
        # now, but never modifies a job another worker already owns.
        if immediate and active.status in {"queued", "retrying"}:
            active.status = "queued"
            active.current_step = "queued"
            active.next_retry_at = None
            active.cancel_requested = False
            active.retryable = True
        return active
    job = AsyncJob(
        tenant_id=run.tenant_id,
        created_by=created_by,
        job_type="agent_run",
        entity_id=run.id,
        input_revision=run.input_revision,
    )
    try:
        # SQLite ignores SELECT FOR UPDATE.  The partial unique index is the
        # final concurrency guard there; a savepoint lets the losing caller
        # recover the winner instead of turning an idempotent enqueue into 500.
        with db.begin_nested():
            db.add(job)
            db.flush()
        return job
    except IntegrityError:
        existing = db.scalar(
            select(AsyncJob)
            .where(
                AsyncJob.tenant_id == run.tenant_id,
                AsyncJob.job_type == "agent_run",
                AsyncJob.entity_id == run.id,
                AsyncJob.status.in_(_ACTIVE_AGENT_JOB_STATUSES),
            )
            .order_by(AsyncJob.created_at)
            .limit(1)
        )
        if existing is None:
            raise
        return existing


def _cancel_agent_jobs_for_run(db: Session, run: AgentRun) -> None:
    """Cancel queued work now and ask an owned worker to stop at its boundary."""
    matching = and_(
        AsyncJob.tenant_id == run.tenant_id,
        AsyncJob.job_type == "agent_run",
        AsyncJob.entity_id == run.id,
    )
    db.execute(
        update(AsyncJob)
        .where(matching, AsyncJob.status.in_(("queued", "retrying")))
        .values(
            status="cancelled",
            current_step="cancelled",
            retryable=False,
            cancel_requested=True,
            next_retry_at=None,
            lease_owner=None,
            lease_expires_at=None,
        )
    )
    db.execute(
        update(AsyncJob)
        .where(matching, AsyncJob.status == "running")
        .values(cancel_requested=True)
    )


def _initial_autonomous_plan() -> dict:
    return {
        "strategy": "deterministic_bounded",
        "stages": [
            {"key": key, "title": title, "status": "pending"}
            for key, title, _steps in _AUTONOMOUS_PLAN
        ],
    }


def _update_plan(
    run: AgentRun,
    steps: list[AgentStepRun],
    *,
    active_step: str | None = None,
    final_review: bool = False,
) -> None:
    """Keep the five UI-visible plan stages durable without adding a second state machine."""
    plan = deepcopy(run.plan_json) if run.plan_json else _initial_autonomous_plan()
    stages = plan.get("stages", [])
    if not stages:
        plan = _initial_autonomous_plan()
        stages = plan["stages"]
    # export_artifacts is marked waiting_approval after its bytes have been produced; its output
    # hash still means the deliver stage itself is complete.
    completed_keys = {
        item.step_key
        for item in steps
        if item.status == "completed" or (item.step_key == "export_artifacts" and item.output_hash)
    }
    for index, (key, _title, stage_steps) in enumerate(_AUTONOMOUS_PLAN):
        stage = stages[index]
        if final_review and key == "review":
            stage["status"] = "waiting_approval"
        elif stage_steps and stage_steps <= completed_keys:
            stage["status"] = "completed"
        elif active_step in stage_steps or completed_keys.intersection(stage_steps):
            stage["status"] = "in_progress"
        elif key != "review":
            stage["status"] = "pending"
    run.plan_json = plan


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


def create_run(
    db: Session,
    principal: Principal,
    project_id: UUID,
    *,
    goal: str,
    input_revision: int,
    mode: str = "autonomous_draft",
    max_iterations: int = 20,
) -> dict:
    get_project(db, principal, project_id)
    run = AgentRun(
        tenant_id=principal.tenant_id,
        project_id=project_id,
        workflow_type=WORKFLOW_TYPE,
        goal=goal,
        mode=mode,
        plan_json=_initial_autonomous_plan() if mode == "autonomous_draft" else {},
        max_iterations=max_iterations,
        input_revision=input_revision,
        created_by=principal.user_id,
    )
    db.add(run)
    db.flush()
    for sequence, (key, _title) in enumerate(BID_WORKFLOW_STEPS, start=1):
        db.add(AgentStepRun(tenant_id=principal.tenant_id, run_id=run.id, step_key=key, sequence=sequence, created_by=principal.user_id))
    db.flush()
    _event(
        db,
        run,
        "run.created",
        {
            "workflow_type": WORKFLOW_TYPE,
            "input_revision": input_revision,
            "mode": mode,
            "max_iterations": max_iterations,
        },
    )
    enqueue_agent_run_job(db, run, created_by=principal.user_id)
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
    if run.mode == "autonomous_draft":
        action_by_step: dict[str, ToolName] = {
            "ingest_documents": "inspect_project",
            "parse_documents": "parse_pending_documents",
            "extract_project_profile": "extract_project_profile",
            "extract_requirements": "extract_requirements",
            "match_evidence": "match_evidence",
            "run_compliance_rules": "run_compliance_checks",
            "draft_responses": "generate_responses",
            "export_artifacts": "assemble_work_package",
        }
        action = action_by_step.get(step.step_key)
        if action:
            result = ToolResult(
                tool=action,
                status="completed",
                summary=f"{step.step_key} 已完成",
                facts=payload,
                artifacts=[step.step_key],
            )
            run.current_action = action
            run.last_observation = result.summary
            _event(db, run, "tool.completed", result.model_dump(mode="json"), step)
        _update_plan(run, _steps(db, run.id))


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
        creator = db.scalar(
            select(User).where(
                User.id == run.created_by,
                User.organization_id == run.tenant_id,
                User.status == "active",
            )
        )
        # Reconstruct the persisted creator's real role.  Elevating a background run to admin
        # would let ordinary project users pull restricted evidence into generated artifacts.
        principal = Principal(
            tenant_id=run.tenant_id,
            user_id=run.created_by,
            role=creator.role if creator is not None else "viewer",
        )
        autonomous = run.mode == "autonomous_draft"
        active_run = run

        def stop_before_commit() -> bool:
            """Check cancellation/ownership before publishing this boundary.

            The callback is present only when invoked by the durable queue.  It
            is intentionally optional so direct service calls retain their
            deterministic behaviour in tests and local tools.
            """
            heartbeat = _agent_heartbeat.get()
            lease_ok = heartbeat() if heartbeat is not None else True
            # Read cancellation through a fresh, read-only session.  The
            # runtime session may have loaded the run before a concurrent
            # cancel committed; its identity map must not publish stale
            # completed/blocked state over that newer decision.
            with SessionLocal() as boundary_db:
                latest_cancel = boundary_db.scalar(
                    select(AgentRun.cancel_requested).where(
                        AgentRun.id == active_run.id,
                        AgentRun.tenant_id == active_run.tenant_id,
                    )
                )
            if lease_ok and not latest_cancel:
                return False
            # Do not let a stale worker publish work after losing its lease.
            # Roll back first, then re-read cancellation written by the API.
            db.rollback()
            db.refresh(active_run)
            if active_run.cancel_requested or latest_cancel:
                active_run.cancel_requested = True
                running_step = db.scalar(
                    select(AgentStepRun)
                    .where(
                        AgentStepRun.run_id == active_run.id,
                        AgentStepRun.status == "running",
                    )
                    .order_by(AgentStepRun.sequence)
                    .limit(1)
                )
                if running_step is not None:
                    running_step.status, running_step.completed_at = "cancelled", utcnow()
                if active_run.status != "cancelled":
                    active_run.status, active_run.completed_at = "cancelled", utcnow()
                    _event(db, active_run, "run.cancelled", {})
                db.commit()
                return True
            return True

        def commit_boundary() -> bool:
            if stop_before_commit():
                return True
            db.commit()
            return False

        run.status, run.started_at = "planning", run.started_at or utcnow()
        run.completed_at, run.error_code, run.error_message = None, None, None
        _event(db, run, "run.started", {})
        if commit_boundary():
            return run.status == "cancelled"
        try:
            for step in _steps(db, run.id):
                db.refresh(run)
                if run.cancel_requested:
                    if step.status != "completed":
                        step.status, step.completed_at = "cancelled", utcnow()
                    run.status, run.completed_at = "cancelled", utcnow()
                    _event(db, run, "run.cancelled", {}, step)
                    db.commit()
                    return True
                if step.status == "completed":
                    continue
                # The planner may only select a registered, persisted workflow action.  Review
                # placeholders are deliberately not tools and are converted below to provisional
                # draft state; no human decision is fabricated.
                if autonomous and step.step_key not in {
                    "review_requirements",
                    "review_evidence_matches",
                    "review_responses",
                }:
                    if run.iteration >= run.max_iterations:
                        step.status = "blocked"
                        run.status, run.completed_at = "completed", utcnow()
                        run.completion_reason = "max_iterations_reached"
                        run.agent_summary = "已达到自主草稿最大执行次数，保留已完成的内部草稿。"
                        _event(
                            db,
                            run,
                            "run.partial",
                            {"reason": run.completion_reason, "iteration": run.iteration},
                            step,
                        )
                        if commit_boundary():
                            return run.status == "cancelled"
                        return True
                    decision = next_decision(_steps(db, run.id))
                    run.iteration += 1
                    run.current_action = decision.tool
                    run.next_action = decision.tool
                    _update_plan(run, _steps(db, run.id), active_step=step.step_key)
                    plan = deepcopy(run.plan_json)
                    plan["last_decision"] = decision.model_dump(mode="json")
                    plan["iteration"] = run.iteration
                    run.plan_json = plan
                    _event(db, run, "agent.decision", decision.model_dump(mode="json"), step)
                run.status, run.current_step, step.status, step.started_at = "running", step.step_key, "running", utcnow()
                step.completed_at, step.error_code, step.error_message = None, None, None
                _event(db, run, "step.started", {"step_key": step.step_key}, step)
                if commit_boundary():
                    return run.status == "cancelled"
                if step.step_key == "ingest_documents":
                    documents = list(db.scalars(select(Document).where(Document.project_id == run.project_id, Document.tenant_id == run.tenant_id, Document.deleted_at.is_(None))))
                    tender_main_count = sum(item.document_type == "tender_main" for item in documents)
                    if not tender_main_count:
                        if autonomous:
                            step.status, step.completed_at = "blocked", utcnow()
                            run.status, run.completed_at = "completed", utcnow()
                            run.completion_reason = "blocked_no_tender_main"
                            run.agent_summary = "未找到招标主文件，无法生成工作包。"
                            _event(
                                db,
                                run,
                                "tool.blocked",
                                ToolResult(
                                    tool="inspect_project",
                                    status="blocked",
                                    summary="未找到招标主文件",
                                    warnings=["请上传至少一份招标主文件后重新运行。"],
                                    needs_user=True,
                                ).model_dump(mode="json"),
                                step,
                            )
                            if commit_boundary():
                                return run.status == "cancelled"
                            return True
                        _fail(db, run, step, "NO_TENDER_MAIN", "请先上传至少一份招标主文件")
                        if commit_boundary():
                            return run.status == "cancelled"
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
                        if autonomous:
                            step.status, step.completed_at = "blocked", utcnow()
                            run.status, run.completed_at = "completed", utcnow()
                            run.completion_reason = "blocked_tender_parse_failed"
                            run.agent_summary = "招标主文件解析失败，保留已完成的内部草稿。"
                            _event(
                                db,
                                run,
                                "tool.blocked",
                                ToolResult(
                                    tool="parse_pending_documents",
                                    status="blocked",
                                    summary="招标主文件解析失败",
                                    warnings=["请检查文件格式或补充可解析版本。"],
                                    needs_user=True,
                                ).model_dump(mode="json"),
                                step,
                            )
                            if commit_boundary():
                                return run.status == "cancelled"
                            return True
                        _fail(db, run, step, "TENDER_PARSE_FAILED", "招标主文件解析失败，无法继续分析")
                        if commit_boundary():
                            return run.status == "cancelled"
                        return False
                    parse_summary = {"parsed_document_count": len(parsed), "total_page_count": sum(item.page_count for item in parsed), "ocr_required_count": 0, "failed_files": failures, "warning": "部分附件未解析，已跳过" if failures else None}
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="parse_summary", title="文件解析结果", storage_key=f"runtime://{run.id}/parse-summary", content_hash=stable_hash(parse_summary), metadata_json=parse_summary, created_by=principal.user_id))
                    _complete(db, run, step, parse_summary)
                elif step.step_key == "extract_project_profile":
                    profile = build_project_profile_candidates(db, principal, run.project_id)
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
                    if autonomous:
                        eligible = list(
                            db.scalars(
                                select(Requirement).where(
                                    Requirement.project_id == run.project_id,
                                    Requirement.tenant_id == run.tenant_id,
                                    Requirement.human_verified.is_(False),
                                    Requirement.extraction_confidence >= Decimal("0.800"),
                                    Requirement.source_document_id.is_not(None),
                                    Requirement.source_page.is_not(None),
                                    Requirement.original_text != "",
                                    Requirement.disqualification_if_failed.is_(False),
                                )
                            )
                        )
                        for requirement in eligible:
                            requirement.review_status = "provisional"
                        _complete(
                            db,
                            run,
                            step,
                            {"provisional_requirement_count": len(eligible), "human_verified": False},
                        )
                        _event(db, run, "review.deferred", {"review": "requirements", "href": f"/projects/{run.project_id}/review"}, step)
                        if commit_boundary():
                            return run.status == "cancelled"
                        continue
                    _request_approval(db, run, step, approval_type="review_requirements", title="请复核招标要求", description="要求候选、来源和低置信度项必须由人工确认后再进入证据匹配。", impact_summary=f"/projects/{run.project_id}/requirements")
                    if commit_boundary():
                        return run.status == "cancelled"
                    return True
                elif step.step_key == "match_evidence":
                    matches = suggest_matches(db, principal, run.project_id, provisional=autonomous)
                    pending_count = sum(match.status in {"suggested", "needs_review"} for match in matches)
                    summary = {"count": pending_count, "summary": "已生成待人工决策的证据候选；不会自动接受或形成最终合规结论。", "href": f"/projects/{run.project_id}/evidence-matching", "severity": "info", "review_state": "manual_review"}
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="evidence_match_candidates", title="证据候选匹配", storage_key=f"runtime://{run.id}/evidence-match-candidates", content_hash=stable_hash(summary), metadata_json=summary, created_by=principal.user_id))
                    _complete(db, run, step, summary)
                elif step.step_key == "review_evidence_matches":
                    if autonomous:
                        provisional_count = 0
                        # Existing suggestions from a previously interrupted run are eligible for
                        # a draft-only promotion.  They remain explicitly non-accepted.
                        for match in suggest_matches(db, principal, run.project_id, provisional=True):
                            if match.status == "suggested" and match.match_score >= 0.85:
                                match.status = "provisional_match"
                            provisional_count += match.status == "provisional_match"
                        _complete(
                            db,
                            run,
                            step,
                            {"provisional_match_count": provisional_count, "human_accepted": False},
                        )
                        _event(db, run, "review.deferred", {"review": "evidence", "href": f"/projects/{run.project_id}/review"}, step)
                        if commit_boundary():
                            return run.status == "cancelled"
                        continue
                    _request_approval(db, run, step, approval_type="review_evidence_matches", title="请复核证据匹配", description="候选证据必须逐条接受或拒绝；未接受的材料不会进入合规结论或响应草稿。", impact_summary=f"/projects/{run.project_id}/evidence-matching")
                    if commit_boundary():
                        return run.status == "cancelled"
                    return True
                elif step.step_key == "run_compliance_rules":
                    checks = run_compliance(db, principal, run.project_id)
                    summary = {result: sum(check.result == result for check in checks) for result in ("pass", "warning", "fail", "manual_review")}
                    summary["href"] = f"/projects/{run.project_id}/evidence-matching"
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="compliance_summary", title="合规检查摘要", storage_key=f"runtime://{run.id}/compliance-summary", content_hash=stable_hash(summary), metadata_json=summary, created_by=principal.user_id))
                    _complete(db, run, step, summary)
                elif step.step_key == "draft_responses":
                    responses = generate_project_responses(
                        db, principal, run.project_id, allow_provisional=autonomous
                    )
                    summary = {"count": len(responses), "missing_evidence_count": sum(item.status == "missing_evidence" for item in responses), "href": f"/projects/{run.project_id}/responses"}
                    db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="response_drafts", title="投标响应草稿", storage_key=f"runtime://{run.id}/response-drafts", content_hash=stable_hash(summary), metadata_json=summary, created_by=principal.user_id))
                    if autonomous:
                        quality = run_response_quality_checks(db, principal, run.project_id)
                        quality_metadata = quality.model_dump(mode="json")
                        db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type="response_quality_check", title="响应草稿质量自查", storage_key=f"runtime://{run.id}/response-quality", content_hash=stable_hash(quality_metadata), metadata_json=quality_metadata, created_by=principal.user_id))
                        for quality_pass in quality.passes:
                            _event(db, run, "response_quality.pass_completed", {"pass_number": quality_pass.pass_number, "issue_count": len(quality_pass.issues), "repaired_count": quality_pass.repaired_count}, step)
                        summary["quality_issue_count"] = quality.issue_count
                        summary["quality_repaired_count"] = quality.repaired_count
                    _complete(db, run, step, summary)
                elif step.step_key == "review_responses":
                    if autonomous:
                        _complete(
                            db,
                            run,
                            step,
                            {"review_state": "internal_draft", "human_approved": False},
                        )
                        _event(db, run, "review.deferred", {"review": "responses", "href": f"/projects/{run.project_id}/review"}, step)
                        if commit_boundary():
                            return run.status == "cancelled"
                        continue
                    _request_approval(db, run, step, approval_type="review_responses", title="请复核投标响应", description="请编辑、补充或批准响应草稿；缺少材料的条款会明确保留待补充标记。", impact_summary=f"/projects/{run.project_id}/responses")
                    if commit_boundary():
                        return run.status == "cancelled"
                    return True
                elif step.step_key == "export_artifacts":
                    exported = export_project_artifacts(db, principal, run.project_id)
                    for artifact in exported:
                        db.add(AgentArtifact(tenant_id=run.tenant_id, run_id=run.id, step_run_id=step.id, artifact_type=artifact["artifact_type"], title=artifact["title"], storage_key=artifact["storage_key"], content_hash=artifact["content_hash"], metadata_json=artifact["metadata"], created_by=principal.user_id))
                    _complete(db, run, step, {"count": len(exported), "artifacts": [item["artifact_type"] for item in exported]})
                    if autonomous:
                        if run.iteration >= run.max_iterations:
                            run.status, run.completed_at = "completed", utcnow()
                            run.completion_reason = "max_iterations_reached"
                            run.agent_summary = "交付物已生成，但未达到最终人工复核。"
                            _event(db, run, "run.partial", {"reason": run.completion_reason}, step)
                            if commit_boundary():
                                return run.status == "cancelled"
                            return True
                        run.iteration += 1
                        run.current_action, run.next_action = "finish_run", "finish_run"
                        finish_decision = next_decision(_steps(db, run.id))
                        _event(db, run, "agent.decision", finish_decision.model_dump(mode="json"), step)
                        _request_approval(
                            db,
                            run,
                            step,
                            approval_type="final_work_package_review",
                            title="请统一复核投标工作包",
                            description="已生成内部草稿及交付物。请在统一复核页确认后再将本次运行标记为完成。",
                            impact_summary=f"/projects/{run.project_id}/review",
                        )
                        _update_plan(run, _steps(db, run.id), final_review=True)
                        run.agent_summary = "内部草稿工作包已生成，等待最终人工复核。"
                        if commit_boundary():
                            return run.status == "cancelled"
                        return True
                if commit_boundary():
                    return run.status == "cancelled"
            run.status, run.completed_at = "completed", utcnow()
            _event(db, run, "run.completed", {"workflow_type": WORKFLOW_TYPE})
            if commit_boundary():
                return run.status == "cancelled"
            return True
        except Exception as exc:
            db.rollback()
            run = db.get(AgentRun, run_id)
            if run is not None:
                step = next((item for item in _steps(db, run.id) if item.status == "running"), _steps(db, run.id)[-1])
                _fail(db, run, step, "RUNTIME_ERROR", str(exc)[:1000])
                if commit_boundary():
                    return run.status == "cancelled"
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
        if run.mode == "autonomous_draft" and approval.approval_type == "final_work_package_review":
            run.status, run.completed_at = "completed", utcnow()
            run.next_action = None
            run.completion_reason = "final_work_package_approved"
            run.agent_summary = "最终工作包已由人工复核确认。"
            _update_plan(run, _steps(db, run.id))
            plan = deepcopy(run.plan_json)
            for stage in plan.get("stages", []):
                if stage.get("key") == "review":
                    stage["status"] = "completed"
            run.plan_json = plan
            _event(db, run, "run.completed", {"approval_type": approval.approval_type, "reason": reason}, step)
        else:
            run.status, run.completed_at = "queued", None
            enqueue_agent_run_job(db, run, created_by=principal.user_id)
            _event(db, run, "run.resumed", {"approval_type": approval.approval_type, "reason": reason}, step)
    else:
        step.status, run.status, run.completed_at = "cancelled", "cancelled", utcnow()
        run.cancel_requested = True
        _cancel_agent_jobs_for_run(db, run)
        _event(db, run, "run.cancelled", {"reason": reason}, step)
    db.commit()
    return _bundle(db, principal, run)


def cancel_run(db: Session, principal: Principal, run_id: UUID) -> dict:
    data = get_run(db, principal, run_id)
    run: AgentRun = data["run"]
    run.cancel_requested = True
    _cancel_agent_jobs_for_run(db, run)
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
    run.completed_at = None
    enqueue_agent_run_job(db, run, created_by=principal.user_id, immediate=True)
    _event(db, run, "run.retry_requested", {})
    db.commit()
    return _bundle(db, principal, run)
