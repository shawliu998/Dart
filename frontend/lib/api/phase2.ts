import { apiDownload, apiRequest, isRemoteApiConfigured } from "./client";
import { amendments, auditRecords, consistencyIssues, evidenceAssets, evidenceMatchGroups, packageChecks, packageTree, remediationTasks } from "@/lib/phase-data/demo";
import type { Amendment, AmendmentChange, AuditRecord, ConsistencyIssue, DataResult, EvidenceAsset, EvidenceCandidate, EvidenceMatchGroup, PackageCheck, PackageNode, RemediationTask } from "@/lib/phase-data/types";

type AnyDto = Record<string, unknown>;
export interface ActionResult<T = unknown> { data: T; persisted: boolean; message: string; failed?: boolean; }

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0) => typeof value === "number" ? value : Number(value ?? fallback);
const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];

export function mapEvidenceDto(dto: AnyDto): EvidenceAsset {
  const claims = Array.isArray(dto.claims) ? dto.claims as AnyDto[] : [];
  return {
    id: text(dto.id), name: text(dto.name ?? dto.filename, "未命名材料"), type: text(dto.type ?? dto.evidence_type, "其他材料"),
    legalEntity: text(dto.legalEntity ?? dto.legal_entity, "主体待确认"), status: ({ active: "verified", verified: "verified", expired: "expired", conflict: "conflict", review: "review", pending_review: "review", expiring: "review" }[text(dto.status)] ?? "review") as EvidenceAsset["status"],
    validUntil: text(dto.validUntil ?? dto.valid_until, "待确认"), expiryDays: num(dto.expiryDays ?? dto.expiry_days, 0), claimCount: num(dto.claimCount ?? dto.claim_count ?? claims.length),
    usageCount: num(dto.usageCount ?? dto.usage_count), owner: text(dto.owner ?? dto.owner_name, "未分配"), department: text(dto.department, "未分类"),
    lastReviewed: text(dto.lastReviewed ?? dto.last_reviewed_at, "未复核"), tags: list(dto.tags), pageCount: num(dto.pageCount ?? dto.page_count, 1), size: text(dto.size_display ?? dto.size, "—"), version: text(dto.version ?? dto.version_number, "V1"), usedBy: list(dto.usedBy ?? dto.used_by),
    claims: claims.map((claim, index) => ({ id: text(claim.id, `claim-${index}`), label: text(claim.label ?? claim.claim_type, "Claim"), value: text(claim.value ?? claim.claim_value), proves: text(claim.proves ?? claim.proves_statement), page: num(claim.page ?? claim.source_page, 1), confidence: num(claim.confidence, 0), conflict: text(claim.conflict) || undefined })),
  };
}

export function mapMatchGroupDto(dto: AnyDto): EvidenceMatchGroup {
  const candidates = Array.isArray(dto.candidates ?? dto.matches) ? (dto.candidates ?? dto.matches) as AnyDto[] : [];
  return { id: text(dto.id ?? dto.requirement_id), requirementCode: text(dto.requirementCode ?? dto.requirement_code), requirementTitle: text(dto.requirementTitle ?? dto.requirement_title, "未命名要求"), risk: text(dto.risk ?? dto.risk_level, "medium") as EvidenceMatchGroup["risk"], requirementStatus: text(dto.requirementStatus ?? dto.requirement_status, "review") as EvidenceMatchGroup["requirementStatus"], page: num(dto.page ?? dto.source_page, 1), selectedEvidenceIds: list(dto.selectedEvidenceIds ?? dto.selected_evidence_ids), candidates: candidates.map((candidate, index) => ({ id: text(candidate.id, `match-${index}`), evidenceId: text(candidate.evidenceId ?? candidate.evidence_id), name: text(candidate.name ?? candidate.evidence_name, "未命名材料"), score: num(candidate.score ?? candidate.match_score), reason: list(candidate.reason ?? candidate.match_reasons), legalEntity: text(candidate.legalEntity ?? candidate.legal_entity, "主体待确认"), validUntil: text(candidate.validUntil ?? candidate.valid_until, "待确认"), completeness: num(candidate.completeness ?? candidate.completeness_score), decision: text(candidate.decision, "pending") as EvidenceCandidate["decision"] })) };
}

export function mapAmendmentDto(dto: AnyDto, changes: AmendmentChange[] = []): Amendment {
  return { id: text(dto.id), name: text(dto.name ?? dto.filename, "补充公告"), publishedAt: text(dto.publishedAt ?? dto.published_at, "待确认"), receivedAt: text(dto.receivedAt ?? dto.received_at, "待确认"), version: text(dto.version ?? dto.version_number, "V1"), status: text(dto.status, "review") as Amendment["status"], changeCount: num(dto.changeCount ?? dto.change_count, changes.length), highImpactCount: num(dto.highImpactCount ?? dto.high_impact_count, changes.filter((item) => item.impact === "high" || item.impact === "fatal").length), changes };
}

export function mapAmendmentChangeDto(dto: AnyDto): AmendmentChange {
  return { id: text(dto.id), type: text(dto.type ?? dto.change_type, "modified") as AmendmentChange["type"], clause: text(dto.clause ?? dto.clause_number), before: text(dto.before ?? dto.before_text, "（无）"), after: text(dto.after ?? dto.after_text, "（无）"), impact: text(dto.impact ?? dto.impact_level, "medium") as AmendmentChange["impact"], affectedRequirements: list(dto.affectedRequirements ?? dto.affected_requirements), affectedEvidence: list(dto.affectedEvidence ?? dto.affected_evidence), affectedTasks: list(dto.affectedTasks ?? dto.affected_tasks), affectsPrice: Boolean(dto.affectsPrice ?? dto.affects_price), needsApproval: Boolean(dto.needsApproval ?? dto.needs_approval), status: text(dto.status, "pending") as AmendmentChange["status"] };
}

export function mapConsistencyDto(dto: AnyDto): ConsistencyIssue {
  const sources = Array.isArray(dto.sources) ? dto.sources as AnyDto[] : [];
  return { id: text(dto.id), field: text(dto.field ?? dto.field_name, "未命名字段"), type: text(dto.type ?? dto.issue_type, "commitment") as ConsistencyIssue["type"], discoveredValues: num(dto.discoveredValues ?? dto.discovered_values, sources.length), documents: num(dto.documents ?? dto.document_count, sources.length), risk: text(dto.risk ?? dto.risk_level, "medium") as ConsistencyIssue["risk"], suggestedValue: text(dto.suggestedValue ?? dto.suggested_value, "待人工确定"), status: text(dto.status, "open") as ConsistencyIssue["status"], owner: text(dto.owner ?? dto.owner_name, "未分配"), reason: text(dto.reason ?? dto.description), sources: sources.map((source, index) => ({ id: text(source.id, `source-${index}`), document: text(source.document ?? source.filename), page: num(source.page ?? source.source_page, 1), value: text(source.value), excerpt: text(source.excerpt ?? source.original_text), modifiedAt: text(source.modifiedAt ?? source.modified_at, "—") })) };
}

export function mapTaskDto(dto: AnyDto): RemediationTask {
  const rawStatus = text(dto.status, "todo");
  return { id: text(dto.id), title: text(dto.title, "未命名任务"), priority: (text(dto.priority, "medium") === "fatal" ? "critical" : text(dto.priority, "medium")) as RemediationTask["priority"], status: ({ ready_for_review: "review", pending: "todo", ...Object.fromEntries(columnsForMapping.map((item) => [item, item])) }[rawStatus] ?? "todo") as RemediationTask["status"], owner: text(dto.owner ?? dto.owner_name, "未分配"), reviewer: text(dto.reviewer ?? dto.reviewer_name, "未分配"), dueDate: text(dto.dueDate ?? dto.due_at ?? dto.due_date, "待确定"), sourceType: text(dto.sourceType ?? dto.source_type, "requirement") as RemediationTask["sourceType"], sourceLabel: text(dto.sourceLabel ?? dto.source_label), reason: text(dto.reason ?? dto.description), evidence: text(dto.evidence), steps: list(dto.steps ?? dto.suggested_steps), attachments: num(dto.attachments ?? dto.attachment_count), comments: num(dto.comments ?? dto.comment_count) };
}
const columnsForMapping = ["todo", "in_progress", "review", "done"];

export function mapAuditDto(dto: AnyDto): AuditRecord {
  const action = text(dto.action, "系统事件");
  return { id: text(dto.id), actor: text(dto.actor ?? dto.actor_name, text(dto.model_name, "系统")), actorType: (dto.model_name ? "agent" : "human") as AuditRecord["actorType"], timestamp: text(dto.timestamp), action, entityType: text(dto.entityType ?? dto.entity_type), entityId: text(dto.entityId ?? dto.entity_id), entityLabel: text(dto.entityLabel ?? dto.entity_label, text(dto.entity_id)), before: typeof dto.before === "string" ? dto.before : JSON.stringify(dto.before ?? "—"), after: typeof dto.after === "string" ? dto.after : JSON.stringify(dto.after ?? "—"), modelOrRule: text(dto.modelOrRule ?? dto.model_name, "人工操作"), promptVersion: text(dto.promptVersion ?? dto.prompt_version, "—"), inputHash: text(dto.inputHash ?? dto.input_hash, "—"), outputHash: text(dto.outputHash ?? dto.output_hash, "—"), humanOverride: Boolean(dto.humanOverride ?? dto.human_override), reason: text(dto.reason, action), risk: text(dto.risk ?? dto.risk_level, "low") as AuditRecord["risk"] };
}

async function getWithFallback<T>(path: string, fallback: T, map?: (dto: AnyDto) => unknown): Promise<DataResult<T>> {
  if (!isRemoteApiConfigured) return { data: fallback, source: "demo" };
  try {
    const response = await apiRequest<unknown>(path);
    if (Array.isArray(response) && response.length > 0) return { data: (map ? response.map((item) => map(item as AnyDto)) : response) as T, source: "api" };
    if (response && !Array.isArray(response)) return { data: response as T, source: "api" };
  } catch { /* Phase endpoint may not be deployed yet. */ }
  return { data: fallback, source: "demo" };
}

async function mutate<T>(path: string, init: RequestInit, demoData: T, demoMessage: string): Promise<ActionResult<T>> {
  if (isRemoteApiConfigured) {
    try { return { data: await apiRequest<T>(path, init), persisted: true, message: "操作已提交后端并进入审计流程。" }; }
    catch (error) { return { data: demoData, persisted: false, failed: true, message: `后端操作失败，未更改本地状态：${error instanceof Error ? error.message : "未知错误"}。可重试或显式进入本地演示。` }; }
  }
  return { data: demoData, persisted: false, message: demoMessage };
}

export const phaseApi = {
  evidence: () => getWithFallback<EvidenceAsset[]>("/api/evidence", evidenceAssets, mapEvidenceDto),
  evidenceMatches: (projectId: string) => getWithFallback<EvidenceMatchGroup[]>(`/api/projects/${projectId}/evidence-matches`, evidenceMatchGroups, mapMatchGroupDto),
  consistency: (projectId: string) => getWithFallback<ConsistencyIssue[]>(`/api/projects/${projectId}/consistency`, consistencyIssues, mapConsistencyDto),
  amendments: async (projectId: string): Promise<DataResult<Amendment[]>> => {
    if (!isRemoteApiConfigured) return { data: amendments, source: "demo" };
    try {
      const rows = await apiRequest<AnyDto[]>(`/api/projects/${projectId}/amendments`);
      if (!rows.length) return { data: amendments, source: "demo" };
      const mapped = await Promise.all(rows.map(async (row) => { try { const changes = await apiRequest<AnyDto[]>(`/api/amendments/${text(row.id)}/changes`); return mapAmendmentDto(row, changes.map(mapAmendmentChangeDto)); } catch { return mapAmendmentDto(row); } }));
      return { data: mapped, source: "api" };
    } catch { return { data: amendments, source: "demo" }; }
  },
  tasks: (projectId: string) => getWithFallback<RemediationTask[]>(`/api/projects/${projectId}/tasks`, remediationTasks, mapTaskDto),
  package: async (projectId: string): Promise<DataResult<{ tree: PackageNode[]; checks: PackageCheck[] }>> => {
    if (!isRemoteApiConfigured) return { data: { tree: packageTree, checks: packageChecks }, source: "demo" };
    try {
      const dto = await apiRequest<AnyDto>(`/api/projects/${projectId}/package`);
      const items = Array.isArray(dto.items) ? dto.items as AnyDto[] : [];
      const tree: PackageNode[] = items.map((item, index) => ({ id: text(item.id, `item-${index}`), packageItemId: text(item.id), name: text(item.name ?? item.filename ?? item.path), type: text(item.type, "file") as PackageNode["type"], status: text(item.status, "warning") as PackageNode["status"], size: text(item.size_display ?? item.size), version: text(item.version ?? item.version_number), children: Array.isArray(item.children) ? (item.children as AnyDto[]).map((child, childIndex) => ({ id: text(child.id, `child-${childIndex}`), packageItemId: text(child.id), name: text(child.name ?? child.filename), type: "file", status: text(child.status, "warning") as PackageNode["status"], size: text(child.size_display ?? child.size), version: text(child.version ?? child.version_number) })) : undefined }));
      const rawChecks = Array.isArray(dto.checks ?? dto.validation_results) ? (dto.checks ?? dto.validation_results) as AnyDto[] : [];
      const checks: PackageCheck[] = rawChecks.map((item, index) => ({ id: text(item.id, `check-${index}`), packageItemId: text(item.package_item_id), label: text(item.label ?? item.rule_name), category: text(item.category, "校验"), status: text(item.status ?? item.result, "warning") as PackageCheck["status"], file: text(item.file ?? item.filename), message: text(item.message), suggestion: text(item.suggestion ?? item.remediation), sourceRequirement: text(item.sourceRequirement ?? item.source_requirement), humanConfirmed: Boolean(item.humanConfirmed ?? item.human_confirmed) }));
      return { data: { tree: tree.length ? tree : packageTree, checks: checks.length ? checks : packageChecks }, source: "api" };
    } catch { return { data: { tree: packageTree, checks: packageChecks }, source: "demo" }; }
  },
  audit: (projectId: string) => getWithFallback<AuditRecord[]>(`/api/projects/${projectId}/audit`, auditRecords, mapAuditDto),
  decideMatch: (id: string, decision: "accept" | "reject", reason: string) => mutate(`/api/evidence-matches/${id}/${decision}`, { method: "POST", body: JSON.stringify({ reason }) }, { id, decision }, `本地演示已${decision === "accept" ? "接受" : "拒绝"}匹配；未写入后端。`),
  resolveConsistency: (id: string, status: "resolved" | "accepted_difference", resolution: string) => mutate(`/api/consistency-issues/${id}/resolve`, { method: "POST", body: JSON.stringify({ status, resolution }) }, { id, status }, "本地演示已更新一致性问题；未写入后端。"),
  applyAmendment: (id: string) => mutate<Amendment>(`/api/amendments/${id}/apply`, { method: "POST", body: JSON.stringify({}) }, amendments.find((item) => item.id === id) ?? amendments[0], "本地演示已应用整份公告的变更影响；未写入后端。"),
  rerunCompliance: (projectId: string) => mutate(`/api/projects/${projectId}/compliance/run`, { method: "POST", body: JSON.stringify({ trigger: "amendment" }) }, { status: "demo_complete" }, "本地演示已重新计算受影响项；未写入后端。"),
  createTask: (projectId: string, task: Partial<RemediationTask>, sourceId: string) => mutate(`/api/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify({ source_type: task.sourceType, source_id: sourceId, title: task.title, description: task.reason ?? task.title, priority: task.priority === "critical" ? "fatal" : task.priority, due_at: task.dueDate }) }, { id: `TASK-DEMO-${Date.now()}`, ...task }, "本地演示任务已创建；未写入后端。"),
  updateTask: (id: string, patch: Partial<RemediationTask>, reason: string) => mutate(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ ...(patch.status ? { status: patch.status } : {}), ...(patch.owner ? { owner_name: patch.owner } : {}), ...(patch.dueDate ? { due_at: patch.dueDate } : {}), reason }) }, { id, ...patch }, "本地演示任务已更新；未写入后端。"),
  completeTask: (id: string) => mutate(`/api/tasks/${id}/complete`, { method: "POST", body: JSON.stringify({ note: "提交完成证明，进入复核" }) }, { id, status: "ready_for_review" }, "本地演示任务已提交复核；未写入后端。"),
  reviewTask: (id: string) => mutate(`/api/tasks/${id}/review`, { method: "POST", body: JSON.stringify({ note: "复核通过" }) }, { id, status: "done" }, "本地演示任务已复核完成；未写入后端。"),
  validatePackage: (projectId: string) => mutate(`/api/projects/${projectId}/package/validate`, { method: "POST", body: JSON.stringify({}) }, { checks: packageChecks }, "本地演示已运行确定性封装检查；未写入后端。"),
  previewPackage: async (projectId: string): Promise<ActionResult<{ package_id: string }>> => { const result = await mutate<AnyDto>(`/api/projects/${projectId}/package/preview`, { method: "POST", body: JSON.stringify({}) }, { package_id: "pkg-demo-preview" }, "本地演示预览包已生成。"); return { ...result, data: { package_id: text(result.data.package_id ?? result.data.id, "pkg-demo-preview") } }; },
  bindPackageItem: (itemId: string, documentId: string) => mutate(`/api/package-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ document_id: documentId, reason: "上传修复文件并绑定封装项" }) }, { id: itemId, document_id: documentId }, "本地演示已绑定修复文件；未写入后端。"),
  downloadPackage: (packageId: string) => apiDownload(`/api/submission-packages/${packageId}/download`),
  buildPackage: async (projectId: string, approved: boolean, approvalReason: string): Promise<ActionResult<{ package_id: string; sha256?: string }>> => { const result = await mutate<AnyDto>(`/api/projects/${projectId}/package/build`, { method: "POST", body: JSON.stringify({ approved, approval_reason: approvalReason }) }, { package_id: "pkg-demo-v4", sha256: "82c12b65a8a03e1a6fd8c1a9aa3f079d" }, "本地演示包已生成，可下载本地 ZIP 和 manifest。"); return { ...result, data: { package_id: text(result.data.package_id ?? result.data.id, "pkg-demo-v4"), sha256: text(result.data.sha256) || undefined } }; },
  exportAudit: (projectId: string) => apiDownload(`/api/projects/${projectId}/audit/export`),
};
