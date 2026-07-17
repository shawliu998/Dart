import { apiRequest, isRemoteApiConfigured } from "./client";
import { createAgentRunBundle, createDemoAgentSnapshot } from "@/lib/agent/demo";
import type { AgentDataResult, AgentRunBundle, AgentSnapshot, AgentSourceRef } from "@/lib/agent/types";

type JsonObject = Record<string, unknown>;
export type AgentRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface AgentApiPayload {
  requirements: unknown;
  evidenceMatches: unknown;
  consistency: unknown;
  amendments: unknown;
  tasks: unknown;
  packageResult: unknown;
  audit: unknown;
}

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const rows = (value: unknown, keys: string[] = []): JsonObject[] => {
  if (Array.isArray(value)) return value.filter(isObject);
  if (!isObject(value)) return [];
  for (const key of keys) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isObject);
  }
  return [];
};
const stringValue = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const numberValue = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function primarySource(requirements: JsonObject[]): AgentSourceRef {
  const candidate = requirements.find((item) => numberValue(item.confidence ?? item.extraction_confidence, 1) < 0.7)
    ?? requirements.find((item) => String(item.risk ?? item.risk_level) === "fatal")
    ?? requirements[0];
  if (!candidate) return createDemoAgentSnapshot().primarySource;
  const confidence = numberValue(candidate.confidence ?? candidate.extraction_confidence, 0);
  return {
    document: stringValue(candidate.sourceDocument ?? candidate.source_document, "招标文件"),
    page: numberValue(candidate.page ?? candidate.source_page, 0) || null,
    excerpt: stringValue(candidate.originalText ?? candidate.original_text, "API 未返回原文摘录，需打开要求工作台核验。"),
    confidence,
    reviewState: confidence < 0.7 ? "manual_review" : "verified",
  };
}

export function snapshotFromAgentApiPayload(payload: AgentApiPayload): AgentSnapshot {
  const requirements = rows(payload.requirements, ["items", "requirements"]);
  const matchGroups = rows(payload.evidenceMatches, ["items", "groups", "matches"]);
  const candidates = matchGroups.flatMap((group) => rows(group.candidates ?? group.matches));
  const consistency = rows(payload.consistency, ["items", "issues"]);
  const amendments = rows(payload.amendments, ["items", "amendments"]);
  const changes = amendments.flatMap((amendment) => rows(amendment.changes));
  const tasks = rows(payload.tasks, ["items", "tasks"]);
  const packageObject = isObject(payload.packageResult) ? payload.packageResult : {};
  const checks = rows(packageObject.checks ?? packageObject.validation_results, ["items"]);
  const audit = rows(payload.audit, ["items", "events", "records"]);
  const latestAuditTime = audit.map((item) => stringValue(item.timestamp ?? item.created_at)).filter(Boolean).sort().at(-1);

  return {
    requirementCount: requirements.length,
    reviewRequirementCount: requirements.filter((item) => {
      const status = String(item.status ?? item.current_status ?? item.review_status ?? "");
      return ["review", "manual_review", "unreviewed"].includes(status) || numberValue(item.confidence ?? item.extraction_confidence, 1) < 0.7;
    }).length,
    fatalRequirementCount: requirements.filter((item) => {
      const risk = String(item.risk ?? item.risk_level ?? "");
      const status = String(item.status ?? item.current_status ?? item.review_status ?? "");
      return risk === "fatal" && !["met", "satisfied", "verified"].includes(status);
    }).length,
    pendingMatchCount: candidates.filter((item) => !["accepted", "rejected"].includes(String(item.decision ?? item.status ?? "pending"))).length,
    openConsistencyCount: consistency.filter((item) => !["resolved", "reasonable", "accepted_difference"].includes(String(item.status ?? "open"))).length,
    pendingAmendmentCount: changes.length
      ? changes.filter((item) => String(item.status ?? "pending") !== "applied").length
      : amendments.reduce((total, item) => total + numberValue(item.change_count ?? item.changeCount), 0),
    openTaskCount: tasks.filter((item) => !["done", "completed", "cancelled"].includes(String(item.status ?? "todo"))).length,
    failedPackageCheckCount: checks.filter((item) => ["failed", "failure", "blocked"].includes(String(item.status ?? item.result ?? ""))).length,
    auditEventCount: audit.length,
    primarySource: primarySource(requirements),
    updatedAt: latestAuditTime ?? "API 当前快照",
  };
}

export async function aggregateAgentRun(
  projectId: string,
  request: AgentRequest = apiRequest,
  remoteConfigured = isRemoteApiConfigured,
): Promise<AgentDataResult<AgentRunBundle>> {
  if (!remoteConfigured) {
    return { source: "demo", data: createAgentRunBundle(projectId), error: null };
  }

  try {
    const [requirements, evidenceMatches, consistency, amendments, tasks, packageResult, audit] = await Promise.all([
      request<unknown>(`/api/projects/${projectId}/requirements`),
      request<unknown>(`/api/projects/${projectId}/evidence-matches`),
      request<unknown>(`/api/projects/${projectId}/consistency`),
      request<unknown>(`/api/projects/${projectId}/amendments`),
      request<unknown>(`/api/projects/${projectId}/tasks`),
      request<unknown>(`/api/projects/${projectId}/package`),
      request<unknown>(`/api/projects/${projectId}/audit`),
    ]);
    const snapshot = snapshotFromAgentApiPayload({ requirements, evidenceMatches, consistency, amendments, tasks, packageResult, audit });
    return { source: "api", data: createAgentRunBundle(projectId, snapshot), error: null };
  } catch (error) {
    return {
      source: "failure",
      data: null,
      error: {
        code: "agent_aggregation_failed",
        message: `Agent 运行聚合失败：${error instanceof Error ? error.message : "未知错误"}。未自动切换为演示数据。`,
        retryable: true,
      },
    };
  }
}

export const agentApi = {
  getRun: (projectId: string) => aggregateAgentRun(projectId),
  getDemoRun: (projectId: string): AgentDataResult<AgentRunBundle> => ({ source: "demo", data: createAgentRunBundle(projectId), error: null }),
};
