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

type StepPresentation = Pick<AgentStep, "title" | "description" | "actor" | "tool">;

/** The server persists the workflow key; the client supplies its stable product-facing meaning. */
export const bidStepPresentation: Record<string, StepPresentation> = {
  ingest_documents: { title: "接收与校验招标文件", description: "校验上传文件并纳入项目文档清单。", actor: "deterministic_rule", tool: "DocumentIngestionService" },
  parse_documents: { title: "解析文档并建立来源索引", description: "解析文件内容，建立可回溯的页码与位置索引。", actor: "deterministic_rule", tool: "DocumentParsingService" },
  extract_project_profile: { title: "提取项目摘要候选", description: "从已解析文件汇总项目基本信息候选。", actor: "mock_model", tool: "ProjectProfileExtraction" },
  extract_requirements: { title: "抽取招标要求候选", description: "抽取要求候选并保留来源位置。", actor: "mock_model", tool: "RequirementExtractionAgent" },
  review_requirements: { title: "人工复核招标要求", description: "在要求工作台确认、修改或退回要求候选。", actor: "human_gate", tool: "RequirementsWorkbench" },
  match_evidence: { title: "生成企业证据候选", description: "为已复核要求生成可解释的材料候选。", actor: "deterministic_rule", tool: "EvidenceMatchingService" },
  review_evidence_matches: { title: "人工复核证据匹配", description: "在证据匹配工作台接受、拒绝或补充候选材料。", actor: "human_gate", tool: "EvidenceMatchingWorkbench" },
  run_compliance_rules: { title: "运行确定性合规检查", description: "基于已确认要求和证据计算合规状态。", actor: "deterministic_rule", tool: "ComplianceRuleEngine" },
  draft_responses: { title: "生成投标响应草稿", description: "根据已接受证据生成可编辑的响应草稿。", actor: "mock_model", tool: "ResponseDraftService" },
  review_responses: { title: "人工复核投标响应", description: "在响应工作台编辑并确认响应草稿。", actor: "human_gate", tool: "ResponsesWorkbench" },
  export_artifacts: { title: "导出交付物", description: "生成可下载的合规矩阵、响应初稿和风险待办。", actor: "deterministic_rule", tool: "ProjectExportService" },
};

const stepKey = (item: JsonObject) => text(item.step_key ?? item.stepKey);

function mapStep(value: unknown, runId: string, index: number): AgentStep {
  const item = object(value);
  const presentation = bidStepPresentation[stepKey(item)];
  return {
    id: text(item.id), runId: text(item.run_id ?? item.runId, runId), sequence: number(item.sequence, index + 1),
    title: text(item.title, presentation?.title ?? stepKey(item) ?? `步骤 ${index + 1}`), description: text(item.description, presentation?.description ?? ""),
    status: oneOf(item.status, ["pending", "running", "waiting_approval", "completed", "failed", "blocked", "cancelled"] as const, "pending"),
    actor: oneOf(item.actor ?? item.actor_kind ?? item.actorKind, ["deterministic_rule", "mock_model", "human_gate"] as const, presentation?.actor ?? "deterministic_rule"),
    tool: text(item.tool, presentation?.tool ?? "") || undefined, summary: text(item.summary) || undefined, sources: sourceRows(item),
    startedAt: nullableText(item.started_at ?? item.startedAt), finishedAt: nullableText(item.completed_at ?? item.finished_at ?? item.finishedAt),
    outputIds: strings(item.output_ids ?? item.outputIds), approvalIds: strings(item.approval_ids ?? item.approvalIds), message: text(item.message ?? item.error_message ?? item.errorMessage),
  };
}

function mapApproval(value: unknown, runId: string): AgentApproval {
  const item = object(value);
  const approvalType = oneOf(item.approval_type ?? item.type, ["review_requirements", "review_evidence_matches", "review_responses", "evidence_match", "compliance_override", "consistency_resolution", "amendment_apply", "package_warning", "package_build", "unknown"] as const, "unknown");
  const impactSummary = text(item.impact_summary ?? item.impactSummary);
  const destinations: Partial<Record<AgentApproval["type"], string>> = {
    review_requirements: "打开要求工作台",
    review_evidence_matches: "打开证据匹配工作台",
    review_responses: "打开响应工作台",
  };
  const destination = destinations[approvalType] ?? "打开审批工作台";
  return {
    id: text(item.id), runId: text(item.run_id ?? item.runId, runId), stepId: text(item.step_run_id ?? item.stepRunId ?? item.step_id ?? item.stepId),
    type: approvalType,
    title: text(item.title), description: text(item.description), impactSummary, reversible: Boolean(item.reversible), reason: text(item.decision_reason ?? item.decisionReason),
    risk: oneOf(item.risk, ["fatal", "high", "medium", "low"] as const, "medium"), status: oneOf(item.status, ["pending", "approved", "rejected"] as const, "pending"),
    requiredRole: text(item.requested_role ?? item.required_role ?? item.requiredRole, "项目负责人"), destinationLabel: text(item.destination_label ?? item.destinationLabel, destination), href: text(item.href, impactSummary.startsWith("/projects/") ? impactSummary : "/agent"), sourceReferences: sourceRows(item),
  };
}

function mapOutput(value: unknown, runId: string, projectId: string): AgentOutput {
  const item = object(value);
  const metadata = object(item.metadata_json ?? item.metadata);
  const artifactType = item.artifact_type ?? item.artifactType;
  const isEvidenceMatchCandidates = artifactType === "evidence_match_candidates";
  const storageKey = text(item.storage_key ?? item.storageKey);
  const downloadHref = text(item.download_url ?? item.downloadUrl ?? metadata.download_url ?? metadata.downloadUrl);
  const isDownloadable = typeof artifactType === "string" && (artifactType.endsWith("_xlsx") || artifactType === "response_draft_docx") || storageKey.startsWith("exports/");
  return {
    id: text(item.id), runId: text(item.run_id ?? item.runId, runId), stepId: text(item.step_run_id ?? item.stepRunId ?? item.step_id ?? item.stepId),
    type: oneOf(isEvidenceMatchCandidates ? "evidence" : item.type ?? artifactType, ["requirement", "risk", "evidence", "task", "report", "package"] as const, "report"),
    kind: oneOf(isEvidenceMatchCandidates ? "evidence" : item.kind ?? artifactType, ["requirements", "risk", "evidence", "consistency", "amendment", "task", "package", "audit"] as const, "audit"),
    title: text(item.title, isEvidenceMatchCandidates ? "候选匹配" : ""), description: text(item.description), summary: text(item.summary ?? metadata.summary), count: number(item.count ?? metadata.count), severity: oneOf(item.severity ?? metadata.severity, ["fatal", "high", "medium", "low", "info"] as const, "info"), href: downloadHref || (isDownloadable ? `/api/agent-artifacts/${text(item.id)}/download` : text(item.href ?? metadata.href, artifactType === "response_drafts" ? `/projects/${projectId}/responses` : artifactType === "compliance_summary" ? `/projects/${projectId}/evidence-matching` : "/agent")), createdAt: text(item.created_at ?? item.createdAt), provenance: sourceRows(item.provenance ?? metadata.provenance),
  };
}

function progressFromSteps(steps: AgentStep[]): number {
  if (!steps.length) return 0;
  const completed = steps.filter((step) => step.status === "completed").length;
  return Math.round((completed / steps.length) * 100);
}

function summaryFromSteps(steps: AgentStep[], approvals: AgentApproval[], status: AgentRun["status"]): string {
  const completed = steps.filter((step) => step.status === "completed").length;
  const current = steps.find((step) => step.status === "running" || step.status === "waiting_approval" || step.status === "blocked");
  if (status === "completed") return `全部 ${steps.length} 个步骤已完成。`;
  if (status === "failed") return `已完成 ${completed}/${steps.length} 个步骤；运行失败，请查看失败步骤。`;
  if (status === "cancelled") return `已完成 ${completed}/${steps.length} 个步骤；运行已取消。`;
  if (status === "waiting_approval") return `已完成 ${completed}/${steps.length} 个步骤；等待 ${approvals.filter((item) => item.status === "pending").length} 项人工审批。`;
  if (current) return `已完成 ${completed}/${steps.length} 个步骤；正在处理「${current.title}」。`;
  return steps.length ? `已完成 ${completed}/${steps.length} 个步骤，等待继续执行。` : "尚未创建执行步骤。";
}

/** Maps the persisted runtime payload; API data never receives synthetic timestamps or people. */
export function agentRunBundleFromApiPayload(payload: unknown, projectId: string): AgentRunBundle {
  const root = object(payload);
  const runValue = object(root.run ?? root.agent_run ?? payload);
  const runId = text(runValue.id);
  if (!runId) throw new Error("invalid_agent_payload");
  const steps = rows(root.steps ?? runValue.steps, ["items", "step_runs", "stepRuns"]).map((item, index) => mapStep(item, runId, index));
  const approvals = rows(root.approvals ?? runValue.approvals, ["items", "approval_requests", "approvalRequests"]).map((item) => mapApproval(item, runId));
  const outputs = rows(root.outputs ?? root.artifacts ?? runValue.outputs ?? runValue.artifacts, ["items", "artifacts"]).map((item) => mapOutput(item, runId, projectId));
  const run: AgentRun = {
    id: runId, projectId: text(runValue.project_id ?? runValue.projectId, projectId), projectName: text(runValue.project_name ?? runValue.projectName, "本地项目"),
    title: text(runValue.title ?? runValue.workflow_type ?? runValue.workflowType, "投标分析运行"), goal: text(runValue.goal),
    status: oneOf(runValue.status, ["queued", "planning", "running", "waiting_approval", "completed", "failed", "cancelled"] as const, "queued"),
    trigger: oneOf(runValue.trigger, ["project_opened", "document_updated", "amendment_received", "manual_rerun"] as const, "manual_rerun"),
    startedAt: text(runValue.started_at ?? runValue.startedAt ?? runValue.created_at ?? runValue.createdAt), updatedAt: text(runValue.updated_at ?? runValue.updatedAt ?? runValue.created_at ?? runValue.createdAt), completedAt: text(runValue.completed_at ?? runValue.completedAt) || undefined,
    progress: progressFromSteps(steps), currentStepId: text(runValue.current_step_id ?? runValue.currentStepId ?? runValue.current_step ?? runValue.currentStep) || undefined, initiatedBy: text(runValue.created_by ?? runValue.createdBy, "本地工作区"),
    promptVersion: text(runValue.prompt_version ?? runValue.promptVersion), policyVersion: text(runValue.policy_version ?? runValue.policyVersion), summary: summaryFromSteps(steps, approvals, oneOf(runValue.status, ["queued", "planning", "running", "waiting_approval", "completed", "failed", "cancelled"] as const, "queued")), steps, approvals, outputs,
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
