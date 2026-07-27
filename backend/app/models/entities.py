from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Date,
    Float,
    ForeignKey,
    Integer,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, UUIDAuditMixin, utcnow


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    legal_name: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class User(Base):
    __tablename__ = "users"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), unique=True)
    role: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="active")
    password_hash: Mapped[str | None] = mapped_column(String(300), nullable=True)


class TenderProject(UUIDAuditMixin, SoftDeleteMixin, Base):
    __tablename__ = "tender_projects"
    organization_id: Mapped[UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(300))
    project_code: Mapped[str] = mapped_column(String(100))
    buyer_name: Mapped[str] = mapped_column(String(300))
    budget_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="CNY")
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    current_stage: Mapped[str] = mapped_column(String(40), default="file_ingestion")
    risk_level: Mapped[str] = mapped_column(String(20), default="unassessed")
    completion_percentage: Mapped[int] = mapped_column(Integer, default=0)
    owner_id: Mapped[UUID | None] = mapped_column(nullable=True)


class Document(UUIDAuditMixin, SoftDeleteMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("project_id", "sha256", name="uq_project_document_hash"),)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    document_type: Mapped[str] = mapped_column(String(40))
    filename: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(500), unique=True)
    mime_type: Mapped[str] = mapped_column(String(150))
    size: Mapped[int]
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    version_number: Mapped[int] = mapped_column(Integer, default=1)
    parse_revision: Mapped[int] = mapped_column(Integer, default=1)
    parse_status: Mapped[str] = mapped_column(String(30), default="pending")
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[UUID]


class DocumentPage(UUIDAuditMixin, Base):
    __tablename__ = "document_pages"
    __table_args__ = (
        UniqueConstraint("document_id", "page_number", "parse_revision", name="uq_document_page"),
    )
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id"), index=True)
    page_number: Mapped[int]
    parse_revision: Mapped[int] = mapped_column(Integer, default=1)
    raw_text: Mapped[str] = mapped_column(Text)
    markdown: Mapped[str] = mapped_column(Text)
    layout_json: Mapped[dict] = mapped_column(JSON, default=dict)
    ocr_used: Mapped[bool] = mapped_column(Boolean, default=False)


class Requirement(UUIDAuditMixin, Base):
    __tablename__ = "requirements"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "source_document_id",
            "source_page",
            "original_hash",
            "extraction_revision",
            name="uq_requirement_source",
        ),
    )
    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    requirement_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(300))
    normalized_requirement: Mapped[str] = mapped_column(Text)
    original_text: Mapped[str] = mapped_column(Text)
    original_hash: Mapped[str] = mapped_column(String(64))
    mandatory: Mapped[bool] = mapped_column(Boolean, default=False)
    disqualification_if_failed: Mapped[bool] = mapped_column(Boolean, default=False)
    risk_level: Mapped[str] = mapped_column(String(20), default="medium")
    source_document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id"))
    source_page: Mapped[int]
    source_bbox: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    clause_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    extraction_confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3))
    extraction_revision: Mapped[int] = mapped_column(Integer, default=1)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    superseded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_status: Mapped[str] = mapped_column(String(30), default="unreviewed")
    human_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    review_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class DisqualificationRule(UUIDAuditMixin, Base):
    __tablename__ = "disqualification_rules"
    requirement_id: Mapped[UUID] = mapped_column(ForeignKey("requirements.id"), unique=True)
    trigger_type: Mapped[str] = mapped_column(String(40))
    trigger_description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20))
    detected_keywords: Mapped[list] = mapped_column(JSON, default=list)
    deterministic_rule: Mapped[str] = mapped_column(String(100))
    decision: Mapped[str] = mapped_column(String(20), default="candidate")
    human_confirmed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class AsyncJob(UUIDAuditMixin, Base):
    __tablename__ = "async_jobs"
    __table_args__ = (
        Index(
            "uq_async_jobs_active_agent_run",
            "tenant_id",
            "job_type",
            "entity_id",
            unique=True,
            sqlite_where=text(
                "job_type = 'agent_run' AND status IN ('queued', 'running', 'retrying')"
            ),
            postgresql_where=text(
                "job_type = 'agent_run' AND status IN ('queued', 'running', 'retrying')"
            ),
        ),
        Index(
            "uq_async_jobs_active_document_analysis",
            "tenant_id",
            "entity_id",
            unique=True,
            sqlite_where=text(
                "job_type IN ('document_parse', 'requirement_extraction', "
                "'document_reanalysis') AND status IN ('queued', 'running', 'retrying')"
            ),
            postgresql_where=text(
                "job_type IN ('document_parse', 'requirement_extraction', "
                "'document_reanalysis') AND status IN ('queued', 'running', 'retrying')"
            ),
        ),
    )
    job_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[UUID]
    status: Mapped[str] = mapped_column(String(20), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    current_step: Mapped[str] = mapped_column(String(200), default="queued")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    retryable: Mapped[bool] = mapped_column(Boolean, default=True)
    # Durable queue fields (P1 agent runtime); all additive and nullable/defaulted.
    lease_owner: Mapped[str | None] = mapped_column(String(100), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    input_revision: Mapped[int] = mapped_column(Integer, default=1)
    result_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentRun(UUIDAuditMixin, Base):
    __tablename__ = "agent_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'planning', 'running', 'waiting_approval', 'completed', "
            "'failed', 'cancelled')",
            name="ck_agent_runs_status",
        ),
        CheckConstraint(
            "outcome IS NULL OR outcome IN ('success', 'partial', 'blocked', 'no_result')",
            name="ck_agent_runs_outcome",
        ),
        CheckConstraint(
            "scope IN ('full_bid_draft', 'risk_review', 'material_gap_analysis', "
            "'response_improvement', 'amendment_reanalysis', 'work_package_check')",
            name="ck_agent_runs_scope",
        ),
        Index("ix_agent_runs_tenant_project", "tenant_id", "project_id"),
        Index(
            "uq_agent_runs_active_project",
            "tenant_id",
            "project_id",
            unique=True,
            sqlite_where=text(
                "status IN ('queued', 'planning', 'running', 'waiting_approval')"
            ),
            postgresql_where=text(
                "status IN ('queued', 'planning', 'running', 'waiting_approval')"
            ),
        ),
    )

    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    workflow_type: Mapped[str] = mapped_column(String(100))
    goal: Mapped[str] = mapped_column(Text)
    # `supervised` preserves the original three review gates.  The default is
    # deliberately the local, draft-only agent mode; it never represents a
    # human approval or a final compliance decision.
    mode: Mapped[str] = mapped_column(String(30), default="autonomous_draft")
    scope: Mapped[str] = mapped_column(String(60), default="full_bid_draft")
    outcome: Mapped[str | None] = mapped_column(String(30), nullable=True)
    plan_json: Mapped[dict] = mapped_column(JSON, default=dict)
    iteration: Mapped[int] = mapped_column(Integer, default=0)
    max_iterations: Mapped[int] = mapped_column(Integer, default=20)
    current_action: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_action: Mapped[str | None] = mapped_column(String(100), nullable=True)
    agent_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    completion_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="queued")
    current_step: Mapped[str | None] = mapped_column(String(100), nullable=True)
    input_revision: Mapped[int] = mapped_column(Integer, default=1)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class AgentStepRun(UUIDAuditMixin, Base):
    __tablename__ = "agent_step_runs"
    __table_args__ = (
        UniqueConstraint("run_id", "sequence", name="uq_agent_step_runs_run_sequence"),
        CheckConstraint(
            "status IN ('pending', 'running', 'waiting_approval', 'completed', 'failed', "
            "'blocked', 'cancelled')",
            name="ck_agent_step_runs_status",
        ),
        Index("ix_agent_step_runs_tenant_run", "tenant_id", "run_id"),
    )

    run_id: Mapped[UUID] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    step_key: Mapped[str] = mapped_column(String(100))
    sequence: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    input_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    output_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class AgentEvent(Base):
    """Append-only runtime event; corrections are represented by a later event."""

    __tablename__ = "agent_events"
    __table_args__ = (
        UniqueConstraint("run_id", "sequence", name="uq_agent_events_run_sequence"),
        Index("ix_agent_events_tenant_run", "tenant_id", "run_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    step_run_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("agent_step_runs.id"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100))
    sequence: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ApprovalRequest(UUIDAuditMixin, Base):
    __tablename__ = "approval_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name="ck_approval_requests_status",
        ),
        Index("ix_approval_requests_tenant_run", "tenant_id", "run_id"),
    )

    run_id: Mapped[UUID] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    step_run_id: Mapped[UUID] = mapped_column(ForeignKey("agent_step_runs.id"), index=True)
    approval_type: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    impact_summary: Mapped[str] = mapped_column(Text)
    reversible: Mapped[bool] = mapped_column(Boolean, default=True)
    requested_role: Mapped[str] = mapped_column(String(40))
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentArtifact(UUIDAuditMixin, Base):
    __tablename__ = "agent_artifacts"
    __table_args__ = (Index("ix_agent_artifacts_tenant_run", "tenant_id", "run_id"),)

    run_id: Mapped[UUID] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    step_run_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("agent_step_runs.id"), nullable=True, index=True
    )
    artifact_type: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(300))
    storage_key: Mapped[str] = mapped_column(String(500))
    content_hash: Mapped[str] = mapped_column(String(64))
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    request_id: Mapped[UUID] = mapped_column(index=True, nullable=False)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    project_id: Mapped[UUID | None] = mapped_column(index=True, nullable=True)
    actor_type: Mapped[str] = mapped_column(String(20))
    actor_id: Mapped[UUID]
    action: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[UUID]
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    before_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    input_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    output_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)


class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    project_id: Mapped[UUID] = mapped_column(index=True)
    task_type: Mapped[str] = mapped_column(String(60))
    provider: Mapped[str] = mapped_column(String(50))
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column(String(50))
    input_hash: Mapped[str] = mapped_column(String(64))
    output_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20))
    output_schema: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_document_id: Mapped[UUID | None] = mapped_column(nullable=True)
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ResponseItem(UUIDAuditMixin, Base):
    """An editable, source-bound draft for one reviewed tender requirement."""

    __tablename__ = "response_items"
    __table_args__ = (
        UniqueConstraint("project_id", "requirement_id", name="uq_response_item_requirement"),
        CheckConstraint(
            "status IN ('not_started', 'drafted', 'needs_review', 'missing_evidence', "
            "'approved', 'excluded')",
            name="ck_response_items_status",
        ),
        Index("ix_response_items_tenant_project", "tenant_id", "project_id"),
    )

    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    requirement_id: Mapped[UUID] = mapped_column(ForeignKey("requirements.id"), index=True)
    model_run_id: Mapped[UUID | None] = mapped_column(ForeignKey("model_runs.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="not_started")
    response_strategy: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    edited_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    missing_information: Mapped[list] = mapped_column(JSON, default=list)
    risk_notes: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    generation_version: Mapped[int] = mapped_column(Integer, default=1)
    revision_number: Mapped[int] = mapped_column(Integer, default=1)
    reviewed_by: Mapped[UUID | None] = mapped_column(nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ResponseRevision(Base):
    """An immutable, user-visible snapshot of a response item."""

    __tablename__ = "response_revisions"
    __table_args__ = (
        UniqueConstraint(
            "response_item_id",
            "revision_number",
            name="uq_response_revision_number",
        ),
        CheckConstraint(
            "event_type IN ('baseline', 'generated', 'edited', 'approved')",
            name="ck_response_revisions_event_type",
        ),
        Index(
            "ix_response_revisions_item_number",
            "response_item_id",
            "revision_number",
        ),
        Index("ix_response_revisions_tenant", "tenant_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID]
    response_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("response_items.id"), index=True
    )
    revision_number: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(20))
    draft_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    edited_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30))
    generation_version: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[UUID]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ResponseEvidenceLink(UUIDAuditMixin, Base):
    __tablename__ = "response_evidence_links"
    __table_args__ = (
        UniqueConstraint(
            "response_item_id", "evidence_claim_id", name="uq_response_evidence_link"
        ),
    )

    response_item_id: Mapped[UUID] = mapped_column(ForeignKey("response_items.id"), index=True)
    evidence_claim_id: Mapped[UUID] = mapped_column(ForeignKey("evidence_claims.id"), index=True)


class EvidenceAsset(UUIDAuditMixin, SoftDeleteMixin, Base):
    __tablename__ = "evidence_assets"
    organization_id: Mapped[UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(300))
    evidence_type: Mapped[str] = mapped_column(String(60))
    legal_entity: Mapped[str] = mapped_column(String(300))
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id"), index=True)
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active")
    owner_id: Mapped[UUID | None] = mapped_column(nullable=True)
    sensitivity: Mapped[str] = mapped_column(String(30), default="internal")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[UUID | None] = mapped_column(nullable=True)


class EvidenceClaim(UUIDAuditMixin, Base):
    __tablename__ = "evidence_claims"
    evidence_asset_id: Mapped[UUID] = mapped_column(ForeignKey("evidence_assets.id"), index=True)
    claim_type: Mapped[str] = mapped_column(String(60))
    subject: Mapped[str] = mapped_column(String(300))
    predicate: Mapped[str] = mapped_column(String(300))
    value: Mapped[str] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_page: Mapped[int]
    source_bbox: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source_text: Mapped[str] = mapped_column(Text)
    extraction_confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3))
    human_verified: Mapped[bool] = mapped_column(Boolean, default=False)


class EvidenceMatch(UUIDAuditMixin, Base):
    __tablename__ = "evidence_matches"
    __table_args__ = (
        UniqueConstraint("requirement_id", "evidence_claim_id", name="uq_evidence_match"),
    )
    requirement_id: Mapped[UUID] = mapped_column(ForeignKey("requirements.id"), index=True)
    evidence_claim_id: Mapped[UUID] = mapped_column(ForeignKey("evidence_claims.id"), index=True)
    match_score: Mapped[float] = mapped_column(Float)
    match_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(30), default="suggested")
    reason: Mapped[str] = mapped_column(Text)
    created_by_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    human_decision: Mapped[str | None] = mapped_column(String(30), nullable=True)
    human_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class ComplianceCheck(UUIDAuditMixin, Base):
    __tablename__ = "compliance_checks"
    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    requirement_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("requirements.id"), nullable=True
    )
    check_type: Mapped[str] = mapped_column(String(60))
    expected: Mapped[str] = mapped_column(Text)
    actual: Mapped[str] = mapped_column(Text)
    result: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(20))
    rule_code: Mapped[str] = mapped_column(String(100))
    reason: Mapped[str] = mapped_column(Text)
    source_references: Mapped[list] = mapped_column(JSON, default=list)
    model_run_id: Mapped[UUID | None] = mapped_column(nullable=True)
    reviewed_by: Mapped[UUID | None] = mapped_column(nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)


class ConsistencyIssue(UUIDAuditMixin, Base):
    __tablename__ = "consistency_issues"
    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    issue_code: Mapped[str] = mapped_column(String(100))
    issue_type: Mapped[str] = mapped_column(String(80))
    entity_key: Mapped[str] = mapped_column(String(200))
    field_name: Mapped[str] = mapped_column(String(100))
    values_found: Mapped[list] = mapped_column(JSON, default=list)
    document_references: Mapped[list] = mapped_column(JSON, default=list)
    severity: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(30), default="open")
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[UUID | None] = mapped_column(nullable=True)


class Amendment(UUIDAuditMixin, Base):
    __tablename__ = "amendments"
    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id"), unique=True)
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    analysis_status: Mapped[str] = mapped_column(String(30), default="pending")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AmendmentChange(UUIDAuditMixin, Base):
    __tablename__ = "amendment_changes"
    amendment_id: Mapped[UUID] = mapped_column(ForeignKey("amendments.id"), index=True)
    change_type: Mapped[str] = mapped_column(String(40))
    old_requirement_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("requirements.id"), nullable=True
    )
    old_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_page: Mapped[int]
    severity: Mapped[str] = mapped_column(String(20))


class AmendmentImpact(UUIDAuditMixin, Base):
    __tablename__ = "amendment_impacts"
    amendment_change_id: Mapped[UUID] = mapped_column(
        ForeignKey("amendment_changes.id"), index=True
    )
    affected_requirement_id: Mapped[UUID | None] = mapped_column(nullable=True)
    affected_evidence_id: Mapped[UUID | None] = mapped_column(nullable=True)
    affected_task_id: Mapped[UUID | None] = mapped_column(nullable=True)
    affected_package_item_id: Mapped[UUID | None] = mapped_column(nullable=True)
    impact_description: Mapped[str] = mapped_column(Text)
    requires_reapproval: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(30), default="open")


class RemediationTask(UUIDAuditMixin, Base):
    __tablename__ = "remediation_tasks"
    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    source_type: Mapped[str] = mapped_column(String(60))
    source_id: Mapped[UUID]
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(30), default="todo")
    assignee_id: Mapped[UUID | None] = mapped_column(nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_id: Mapped[UUID | None] = mapped_column(nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class PackageItem(UUIDAuditMixin, Base):
    __tablename__ = "package_items"
    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    parent_id: Mapped[UUID | None] = mapped_column(nullable=True)
    name: Mapped[str] = mapped_column(String(300))
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    file_rule: Mapped[dict] = mapped_column(JSON, default=dict)
    naming_rule: Mapped[str | None] = mapped_column(String(300), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    document_id: Mapped[UUID | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="missing")
    validation_results: Mapped[list] = mapped_column(JSON, default=list)


class SubmissionPackage(UUIDAuditMixin, SoftDeleteMixin, Base):
    __tablename__ = "submission_packages"
    project_id: Mapped[UUID] = mapped_column(ForeignKey("tender_projects.id"), index=True)
    package_version: Mapped[int] = mapped_column("version_number", Integer, default=1)
    storage_key: Mapped[str] = mapped_column(String(500))
    manifest_storage_key: Mapped[str] = mapped_column(String(500))
    sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(30), default="preview")
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    generated_by: Mapped[UUID]
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    approved_by: Mapped[UUID | None] = mapped_column(nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
