export type AgentDataSource = "api" | "demo" | "failure";

export type AgentRunStatus = "queued" | "planning" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";
export type AgentStepStatus = "pending" | "running" | "completed" | "failed" | "blocked";
export type AgentApprovalStatus = "pending" | "approved" | "rejected";
export type AgentOutputType = "requirement" | "risk" | "evidence" | "task" | "report" | "package";
export type AgentOutputKind = "requirements" | "risk" | "evidence" | "consistency" | "amendment" | "task" | "package" | "audit";
export type AgentActorKind = "deterministic_rule" | "mock_model" | "human_gate";

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
  steps: AgentStep[];
  approvals: ApprovalRequest[];
  outputs: AgentOutput[];
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
  type: "evidence_match" | "compliance_override" | "consistency_resolution" | "amendment_apply" | "package_warning" | "package_build";
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

export interface AgentOutput {
  id: string;
  runId: string;
  stepId: string;
  type: AgentOutputType;
  kind: AgentOutputKind;
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
}

export interface AgentFailure {
  code: "agent_aggregation_failed" | "invalid_agent_payload";
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
}
