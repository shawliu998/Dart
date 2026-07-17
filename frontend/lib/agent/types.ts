export type AgentDataSource = "api" | "demo" | "failure";
export type AgentMode = "autonomous_draft" | "supervised";
export type AgentScope = "full_bid_draft" | "risk_review" | "material_gap_analysis" | "response_improvement" | "amendment_reanalysis" | "work_package_check";
export type AgentOutcome = "success" | "partial" | "blocked" | "no_result";

export type AgentRunStatus = "queued" | "planning" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";
export type AgentStepStatus = "pending" | "running" | "waiting_approval" | "completed" | "failed" | "blocked" | "cancelled";
export type AgentApprovalStatus = "pending" | "approved" | "rejected";
export type AgentOutputType = "requirement" | "risk" | "evidence" | "task" | "report" | "package";
export type AgentOutputKind = "requirements" | "risk" | "evidence" | "consistency" | "amendment" | "task" | "package" | "audit";
export type AgentActorKind = "deterministic_rule" | "mock_model" | "human_gate";
export type AgentPlanStageKey = "understand" | "evidence" | "draft" | "deliver" | "review";
export type AgentPlanStageStatus = "pending" | "in_progress" | "completed" | "waiting_approval";

/** A durable stage from AgentRun.plan_json; it is never inferred from step text or progress. */
export interface AgentPlanStage {
  key: AgentPlanStageKey;
  title: string;
  status: AgentPlanStageStatus;
}

/** Append-only event persisted by the runtime. Unknown event types remain deliberately generic. */
export interface AgentEvent {
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface AgentSourceRef {
  document: string;
  page: number | null;
  excerpt: string;
  confidence: number | null;
  reviewState: "verified" | "manual_review" | "rule_result";
}

export interface AgentRun {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  goal: string;
  mode: AgentMode;
  scope: AgentScope;
  outcome?: AgentOutcome;
  maxIterations: number;
  iteration: number;
  currentAction?: string;
  nextAction?: string;
  observation?: string;
  completionReason?: string;
  status: AgentRunStatus;
  trigger: "project_opened" | "document_updated" | "amendment_received" | "manual_rerun";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  progress: number;
  currentStepId?: string;
  initiatedBy: string;
  promptVersion: string;
  policyVersion: string;
  summary: string;
  planStages: AgentPlanStage[];
  steps: AgentStep[];
  approvals: ApprovalRequest[];
  outputs: AgentOutput[];
}

export interface AgentRunCreateInput {
  goal?: string;
  mode?: AgentMode;
  scope?: AgentScope;
  maxIterations?: number;
}

export interface AgentStep {
  id: string;
  runId: string;
  sequence: number;
  title: string;
  description: string;
  status: AgentStepStatus;
  actor: AgentActorKind;
  tool?: string;
  summary?: string;
  sources?: AgentSourceRef[];
  startedAt: string | null;
  finishedAt: string | null;
  outputIds: string[];
  approvalIds: string[];
  message: string;
}

export interface ApprovalRequest {
  id: string;
  runId: string;
  stepId: string;
  /**
   * Persisted approval types are deliberately explicit.  An unrecognised
   * server value must not be presented as a compliance override, because that
   * changes the meaning of a human decision in the workbench.
   */
  type: "review_requirements" | "review_evidence_matches" | "review_responses" | "evidence_match" | "compliance_override" | "consistency_resolution" | "amendment_apply" | "package_warning" | "package_build" | "final_work_package_review" | "unknown";
  title: string;
  description: string;
  impactSummary: string;
  reversible: boolean;
  reason: string;
  risk: "fatal" | "high" | "medium" | "low";
  status: AgentApprovalStatus;
  requiredRole: string;
  destinationLabel: string;
  href: string;
  sourceReferences: AgentSourceRef[];
}

export type AgentApproval = ApprovalRequest;

export interface AgentOutputMetrics {
  assetCount?: number;
  newClaimCount?: number;
  failedAssetCount?: number;
  responseCount?: number;
  missingEvidenceCount?: number;
  qualityIssueCount?: number;
  qualityRepairedCount?: number;
  remediationTaskCount?: number;
}

export interface AgentOutput {
  id: string;
  runId: string;
  stepId: string;
  type: AgentOutputType;
  kind: AgentOutputKind;
  /** Original backend artifact_type when this output was derived from an AgentArtifact. */
  artifactType?: string;
  /** Structured counts surfaced as metric chips in the workbench. */
  metrics?: AgentOutputMetrics;
  title: string;
  description: string;
  summary: string;
  count: number;
  severity: "fatal" | "high" | "medium" | "low" | "info";
  href: string;
  createdAt: string;
  provenance: AgentSourceRef[];
}

export interface AgentRunBundle {
  run: AgentRun;
  steps: AgentStep[];
  approvals: AgentApproval[];
  outputs: AgentOutput[];
  events: AgentEvent[];
}

export interface AgentFailure {
  code: "agent_run_request_failed" | "invalid_agent_payload" | "demo_mode_disabled";
  message: string;
  retryable: boolean;
}

export type AgentDataResult<T> =
  | { source: "api"; data: T; error: null }
  | { source: "demo"; data: T; error: null }
  | { source: "failure"; data: null; error: AgentFailure };

export interface AgentSnapshot {
  requirementCount: number;
  reviewRequirementCount: number;
  fatalRequirementCount: number;
  pendingMatchCount: number;
  openConsistencyCount: number;
  pendingAmendmentCount: number;
  openTaskCount: number;
  failedPackageCheckCount: number;
  auditEventCount: number;
  primarySource: AgentSourceRef;
  updatedAt: string;
  evidenceAssetCount?: number;
  evidenceClaimCount?: number;
  evidenceClaimFailedAssetCount?: number;
  responseCount?: number;
  missingEvidenceResponseCount?: number;
  responseQualityIssueCount?: number;
  responseQualityRepairedCount?: number;
  remediationTaskCreatedCount?: number;
}
