import { apiRequest, isDemoMode } from "./client";
import { createAgentRunBundle } from "@/lib/agent/demo";
import type { AgentApproval, AgentDataResult, AgentOutput, AgentRun, AgentRunBundle, AgentSourceRef, AgentStep } from "@/lib/agent/types";

type JsonObject = Record<string, unknown>;
export type AgentRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export interface AgentRunListPayload { items?: unknown; runs?: unknown; agent_runs?: unknown; }
export interface AgentActionInput { reason?: string; }

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const object = (value: unknown): JsonObject => isObject(value) ? value : {};
const rows = (value: unknown, keys: string[] = []): JsonObject[] => {
  if (Array.isArray(value)) return value.filter(isObject);
  const source = object(value);
  for (const key of keys) if (Array.isArray(source[key])) return source[key].filter(isObject);
  return [];
};
const text = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;
const number = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const nullableText = (value: unknown): string | null => typeof value === "string" ? value : null;
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback;
const source = (value: unknown): AgentSourceRef => {
  const item = object(value);
  const confidenceValue = item.confidence ?? item.extraction_confidence;
  const confidence = confidenceValue === null || confidenceValue === undefined ? null : number(confidenceValue, 0);
  return {
    document: text(item.document ?? item.source_document ?? item.sourceDocument, "未提供来源文档"),
    page: number(item.page ?? item.source_page ?? item.sourcePage, 0) || null,
    excerpt: text(item.excerpt ?? item.original_text ?? item.originalText, "未提供来源摘录"),
    confidence,
    reviewState: oneOf(item.review_state ?? item.reviewState, ["verified", "manual_review", "rule_result"] as const, confidence !== null && confidence < 0.7 ? "manual_review" : "rule_result"),
  };
};
const sourceRows = (value: unknown) => rows(value, ["source_references", "sourceReferences", "sources", "provenance"]).map(source);
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

function mapStep(value: unknown, runId: string, index: number): AgentStep {
  const item = object(value);
  return {
    id: text(item.id), runId: text(item.run_id ?? item.runId, runId), sequence: number(item.sequence, index + 1),
    title: text(item.title ?? item.step_key ?? item.stepKey, `步骤 ${index + 1}`), description: text(item.description),
    status: oneOf(item.status, ["pending", "running", "waiting_approval", "completed", "failed", "blocked", "cancelled"] as const, "pending"),
    actor: oneOf(item.actor ?? item.actor_kind ?? item.actorKind, ["deterministic_rule", "mock_model", "human_gate"] as const, "deterministic_rule"),
    tool: text(item.tool) || undefined, summary: text(item.summary) || undefined, sources: sourceRows(item),
    startedAt: nullableText(item.started_at ?? item.startedAt), finishedAt: nullableText(item.completed_at ?? item.finished_at ?? item.finishedAt),
    outputIds: strings(item.output_ids ?? item.outputIds), approvalIds: strings(item.approval_ids ?? item.approvalIds), message: text(item.message ?? item.error_message ?? item.errorMessage),
  };
}

function mapApproval(value: unknown, runId: string): AgentApproval {
  const item = object(value);
  return {
    id: text(item.id), runId: text(item.run_id ?? item.runId, runId), stepId: text(item.step_run_id ?? item.stepRunId ?? item.step_id ?? item.stepId),
    type: oneOf(item.approval_type ?? item.type, ["evidence_match", "compliance_override", "consistency_resolution", "amendment_apply", "package_warning", "package_build"] as const, "compliance_override"),
    title: text(item.title), description: text(item.description), impactSummary: text(item.impact_summary ?? item.impactSummary), reversible: Boolean(item.reversible), reason: text(item.decision_reason ?? item.decisionReason),
    risk: oneOf(item.risk, ["fatal", "high", "medium", "low"] as const, "medium"), status: oneOf(item.status, ["pending", "approved", "rejected"] as const, "pending"),
    requiredRole: text(item.requested_role ?? item.required_role ?? item.requiredRole, "项目负责人"), destinationLabel: text(item.destination_label ?? item.destinationLabel, "打开审批工作台"), href: text(item.href, "#"), sourceReferences: sourceRows(item),
  };
}

function mapOutput(value: unknown, runId: string): AgentOutput {
  const item = object(value);
  const metadata = object(item.metadata_json ?? item.metadata);
  const artifactType = item.artifact_type ?? item.artifactType;
  const isEvidenceMatchCandidates = artifactType === "evidence_match_candidates";
  return {
    id: text(item.id), runId: text(item.run_id ?? item.runId, runId), stepId: text(item.step_run_id ?? item.stepRunId ?? item.step_id ?? item.stepId),
    type: oneOf(isEvidenceMatchCandidates ? "evidence" : item.type ?? artifactType, ["requirement", "risk", "evidence", "task", "report", "package"] as const, "report"),
    kind: oneOf(isEvidenceMatchCandidates ? "evidence" : item.kind ?? artifactType, ["requirements", "risk", "evidence", "consistency", "amendment", "task", "package", "audit"] as const, "audit"),
    title: text(item.title, isEvidenceMatchCandidates ? "候选匹配" : ""), description: text(item.description), summary: text(item.summary ?? metadata.summary), count: number(item.count ?? metadata.count), severity: oneOf(item.severity ?? metadata.severity, ["fatal", "high", "medium", "low", "info"] as const, "info"), href: text(item.href ?? metadata.href, "#"), createdAt: text(item.created_at ?? item.createdAt), provenance: sourceRows(item.provenance ?? metadata.provenance),
  };
}

/** Maps the persisted runtime payload; API data never receives synthetic timestamps or people. */
export function agentRunBundleFromApiPayload(payload: unknown, projectId: string): AgentRunBundle {
  const root = object(payload);
  const runValue = object(root.run ?? root.agent_run ?? payload);
  const runId = text(runValue.id);
  if (!runId) throw new Error("invalid_agent_payload");
  const steps = rows(root.steps ?? runValue.steps, ["items", "step_runs", "stepRuns"]).map((item, index) => mapStep(item, runId, index));
  const approvals = rows(root.approvals ?? runValue.approvals, ["items", "approval_requests", "approvalRequests"]).map((item) => mapApproval(item, runId));
  const outputs = rows(root.outputs ?? root.artifacts ?? runValue.outputs ?? runValue.artifacts, ["items", "artifacts"]).map((item) => mapOutput(item, runId));
  const run: AgentRun = {
    id: runId, projectId: text(runValue.project_id ?? runValue.projectId, projectId), projectName: text(runValue.project_name ?? runValue.projectName, "本地项目"),
    title: text(runValue.title ?? runValue.workflow_type ?? runValue.workflowType, "投标分析运行"), goal: text(runValue.goal),
    status: oneOf(runValue.status, ["queued", "planning", "running", "waiting_approval", "completed", "failed", "cancelled"] as const, "queued"),
    trigger: oneOf(runValue.trigger, ["project_opened", "document_updated", "amendment_received", "manual_rerun"] as const, "manual_rerun"),
    startedAt: text(runValue.started_at ?? runValue.startedAt ?? runValue.created_at ?? runValue.createdAt), updatedAt: text(runValue.updated_at ?? runValue.updatedAt ?? runValue.created_at ?? runValue.createdAt), completedAt: text(runValue.completed_at ?? runValue.completedAt) || undefined,
    progress: number(runValue.progress), currentStepId: text(runValue.current_step_id ?? runValue.currentStepId ?? runValue.current_step ?? runValue.currentStep) || undefined, initiatedBy: text(runValue.created_by ?? runValue.createdBy, "本地工作区"),
    promptVersion: text(runValue.prompt_version ?? runValue.promptVersion), policyVersion: text(runValue.policy_version ?? runValue.policyVersion), summary: text(runValue.summary ?? runValue.error_message ?? runValue.errorMessage), steps, approvals, outputs,
  };
  return { run, steps, approvals, outputs };
}

function failure(error: unknown): AgentDataResult<AgentRunBundle> {
  const message = error instanceof Error ? error.message : "未知错误";
  return { source: "failure", data: null, error: { code: message === "invalid_agent_payload" ? "invalid_agent_payload" : "agent_run_request_failed", message: `Agent 运行请求失败：${message}。未自动切换为演示数据。`, retryable: true } };
}

export async function getLatestAgentRun(projectId: string, request: AgentRequest = apiRequest): Promise<AgentDataResult<AgentRunBundle>> {
  if (isDemoMode) return { source: "demo", data: createAgentRunBundle(projectId), error: null };
  try {
    const payload = await request<AgentRunListPayload | unknown>(`/api/projects/${projectId}/agent-runs`);
    const list = rows(payload, ["items", "runs", "agent_runs"]);
    if (!list.length) throw new Error("未找到 Agent 运行记录");
    return { source: "api", data: agentRunBundleFromApiPayload(list[0], projectId), error: null };
  } catch (error) { return failure(error); }
}

export async function createAgentRun(projectId: string, request: AgentRequest = apiRequest): Promise<AgentDataResult<AgentRunBundle>> {
  try { return { source: "api", data: agentRunBundleFromApiPayload(await request(`/api/projects/${projectId}/agent-runs`, { method: "POST", body: JSON.stringify({}) }), projectId), error: null }; } catch (error) { return failure(error); }
}

export async function getAgentRun(runId: string, projectId: string, request: AgentRequest = apiRequest): Promise<AgentDataResult<AgentRunBundle>> {
  try { return { source: "api", data: agentRunBundleFromApiPayload(await request(`/api/agent-runs/${runId}`), projectId), error: null }; } catch (error) { return failure(error); }
}

export const agentApi = {
  getRun: getLatestAgentRun,
  createRun: createAgentRun,
  getRunById: getAgentRun,
  events: (runId: string, request: AgentRequest = apiRequest) => request(`/api/agent-runs/${runId}/events`),
  cancel: (runId: string, request: AgentRequest = apiRequest) => request(`/api/agent-runs/${runId}/cancel`, { method: "POST", body: JSON.stringify({}) }),
  retry: (runId: string, request: AgentRequest = apiRequest) => request(`/api/agent-runs/${runId}/retry`, { method: "POST", body: JSON.stringify({}) }),
  approve: (approvalId: string, input: AgentActionInput, request: AgentRequest = apiRequest) => request(`/api/approvals/${approvalId}/approve`, { method: "POST", body: JSON.stringify(input) }),
  reject: (approvalId: string, input: AgentActionInput, request: AgentRequest = apiRequest) => request(`/api/approvals/${approvalId}/reject`, { method: "POST", body: JSON.stringify(input) }),
  getDemoRun: (projectId: string): AgentDataResult<AgentRunBundle> => isDemoMode ? { source: "demo", data: createAgentRunBundle(projectId), error: null } : { source: "failure", data: null, error: { code: "demo_mode_disabled", message: "演示模式未启用。未自动切换为演示数据。", retryable: false } },
};
