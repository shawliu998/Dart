import { apiDownload, apiRequest, isRemoteApiConfigured } from "./client";
import { amendments, auditRecords, consistencyIssues, evidenceAssets, evidenceMatchGroups, packageChecks, packageTree, remediationTasks } from "@/lib/phase-data/demo";
import type { Amendment, AmendmentChange, AuditRecord, ConsistencyIssue, DataResult, EvidenceAsset, EvidenceCandidate, EvidenceMatchGroup, PackageCheck, PackageNode, RemediationTask } from "@/lib/phase-data/types";

type AnyDto = Record<string, unknown>;
export type ActionResult<T = unknown> =
  | { data: T; persisted: boolean; message: string; failed?: false }
  | { data: null; persisted: false; message: string; failed: true };

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0) => typeof value === "number" ? value : Number(value ?? fallback);
const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
const reasons = (value: unknown) => Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : [];

function matchDecision(dto: AnyDto): EvidenceCandidate["decision"] {
  const decision = text(dto.human_decision ?? dto.decision ?? dto.status).toLowerCase();
  if (decision === "accepted" || decision === "accept") return "accepted";
  if (decision === "rejected" || decision === "reject") return "rejected";
  return "pending";
}

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
  return { id: text(dto.id ?? dto.requirement_id), requirementCode: text(dto.requirementCode ?? dto.requirement_code), requirementTitle: text(dto.requirementTitle ?? dto.requirement_title, "未命名要求"), risk: text(dto.risk ?? dto.risk_level, "medium") as EvidenceMatchGroup["risk"], requirementStatus: text(dto.requirementStatus ?? dto.requirement_status, "review") as EvidenceMatchGroup["requirementStatus"], page: num(dto.page ?? dto.source_page, 1), selectedEvidenceIds: list(dto.selectedEvidenceIds ?? dto.selected_evidence_ids), candidates: candidates.map((candidate, index) => ({ id: text(candidate.id, `match-${index}`), evidenceId: text(candidate.evidenceId ?? candidate.evidence_id), name: text(candidate.name ?? candidate.evidence_name, "未命名材料"), score: num(candidate.score ?? candidate.match_score), reason: reasons(candidate.reason ?? candidate.match_reasons), legalEntity: text(candidate.legalEntity ?? candidate.legal_entity, "主体待确认"), validUntil: text(candidate.validUntil ?? candidate.valid_until, "待确认"), completeness: num(candidate.completeness ?? candidate.completeness_score), decision: matchDecision(candidate) })) };
}

/** Adapts the API's relational match rows into the workbench's requirement groups. */
export function mapFlatEvidenceMatchRows(rows: AnyDto[]): EvidenceMatchGroup[] {
  const groups = new Map<string, EvidenceMatchGroup>();
  rows.forEach((row, index) => {
    const match = (row.match && typeof row.match === "object" ? row.match : {}) as AnyDto;
    const requirement = (row.requirement && typeof row.requirement === "object" ? row.requirement : {}) as AnyDto;
    const claim = (row.claim && typeof row.claim === "object" ? row.claim : {}) as AnyDto;
    const asset = (row.asset && typeof row.asset === "object" ? row.asset : {}) as AnyDto;
    const requirementId = text(requirement.id ?? match.requirement_id, `requirement-${index}`);
    const candidate = {
      id: text(match.id, `match-${index}`),
      evidenceId: text(asset.id ?? claim.evidence_asset_id),
      name: text(asset.name ?? asset.filename, "未命名材料"),
      score: num(match.match_score ?? match.score),
      reason: [...reasons(match.reason ?? match.match_reasons), ...reasons(match.human_reason)],
      legalEntity: text(asset.legal_entity ?? asset.legalEntity, "主体待确认"),
      validUntil: text(asset.expiry_date ?? asset.valid_until ?? asset.validUntil, "待确认"),
      completeness: num(match.completeness_score ?? match.completeness, 0),
      decision: matchDecision(match),
    } satisfies EvidenceCandidate;
    let group = groups.get(requirementId);
    if (!group) {
      group = {
        id: requirementId,
        requirementCode: text(requirement.requirement_code ?? requirement.code),
        requirementTitle: text(requirement.title ?? requirement.normalized_requirement, "未命名要求"),
        risk: text(requirement.risk_level ?? requirement.risk, "medium") as EvidenceMatchGroup["risk"],
        requirementStatus: "review",
        page: num(requirement.source_page ?? requirement.page, 1),
        selectedEvidenceIds: [],
        candidates: [],
      };
      groups.set(requirementId, group);
    }
    group.candidates.push(candidate);
    if (candidate.decision === "accepted" && candidate.evidenceId && !group.selectedEvidenceIds.includes(candidate.evidenceId)) group.selectedEvidenceIds.push(candidate.evidenceId);
  });
  return [...groups.values()];
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
  const rawSourceType = text(dto.sourceType ?? dto.source_type, "requirement");
  const sourceType = ({ package_validation: "package", amendment_change: "amendment", compliance_check: "requirement" }[rawSourceType] ?? rawSourceType) as RemediationTask["sourceType"];
  const sourceLabel = ({ package_validation: "封装检查", amendment_change: "补充公告", compliance_check: "合规检查", requirement: "招标要求", evidence: "企业材料", disqualification: "否决风险", consistency: "一致性检查", amendment: "补充公告", package: "文件封装", manual: "人工创建", agent_ocr_required: "OCR 补救", agent_compliance_check: "Agent 合规检查", agent_response_gap: "响应缺口" }[rawSourceType] ?? rawSourceType);
  const rawDueDate = text(dto.dueDate ?? dto.due_at ?? dto.due_date, "待确定");
  const parsedDueDate = new Date(rawDueDate);
  const dueDate = Number.isNaN(parsedDueDate.getTime()) ? rawDueDate : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsedDueDate).replaceAll("/", "-");
  return { id: text(dto.id), title: text(dto.title, "未命名任务"), priority: (text(dto.priority, "medium") === "fatal" ? "critical" : text(dto.priority, "medium")) as RemediationTask["priority"], status: ({ ready_for_review: "review", pending: "todo", ...Object.fromEntries(columnsForMapping.map((item) => [item, item])) }[rawStatus] ?? "todo") as RemediationTask["status"], owner: text(dto.owner ?? dto.owner_name, "未分配"), reviewer: text(dto.reviewer ?? dto.reviewer_name, "未分配"), dueDate, sourceType, sourceLabel: text(dto.sourceLabel ?? dto.source_label, sourceLabel), reason: text(dto.reason ?? dto.description), evidence: text(dto.evidence), steps: list(dto.steps ?? dto.suggested_steps), attachments: num(dto.attachments ?? dto.attachment_count), comments: num(dto.comments ?? dto.comment_count) };
}
const columnsForMapping = ["todo", "in_progress", "review", "done"];

export function mapAuditDto(dto: AnyDto): AuditRecord {
  const action = text(dto.action, "系统事件");
  return { id: text(dto.id), actor: text(dto.actor ?? dto.actor_name, text(dto.model_name, "系统")), actorType: (dto.model_name ? "agent" : "human") as AuditRecord["actorType"], timestamp: text(dto.timestamp), action, entityType: text(dto.entityType ?? dto.entity_type), entityId: text(dto.entityId ?? dto.entity_id), entityLabel: text(dto.entityLabel ?? dto.entity_label, text(dto.entity_id)), before: typeof dto.before === "string" ? dto.before : JSON.stringify(dto.before ?? "—"), after: typeof dto.after === "string" ? dto.after : JSON.stringify(dto.after ?? "—"), modelOrRule: text(dto.modelOrRule ?? dto.model_name, "人工操作"), promptVersion: text(dto.promptVersion ?? dto.prompt_version, "—"), inputHash: text(dto.inputHash ?? dto.input_hash, "—"), outputHash: text(dto.outputHash ?? dto.output_hash, "—"), humanOverride: Boolean(dto.humanOverride ?? dto.human_override), reason: text(dto.reason, action), risk: text(dto.risk ?? dto.risk_level, "low") as AuditRecord["risk"] };
}

const packageRuleLabels: Record<string, { label: string; category: string; suggestion: string }> = {
  REQUIRED_FILE: { label: "必要文件存在", category: "完整性", suggestion: "上传并绑定缺失的必需文件后重新运行检查。" },
  TENANT_OR_VERSION: { label: "文件版本可用", category: "版本", suggestion: "重新选择当前租户下可用的文件版本。" },
  FORMAT: { label: "文件格式", category: "格式", suggestion: "转换为规则允许的 PDF、DOCX 或 XLSX 格式。" },
  FILENAME: { label: "文件命名规范", category: "命名", suggestion: "按章节编号和命名规则重命名文件。" },
  SOURCE_FILENAME: { label: "源文件命名", category: "命名", suggestion: "按最终封装目录的命名规则重命名源文件。" },
  FINAL_FORMAT: { label: "最终提交格式", category: "格式", suggestion: "按招标要求转换为最终提交格式。" },
  RELATED_DOCUMENT: { label: "关联证明完整", category: "完整性", suggestion: "补充合同对应的验收或其他关联证明。" },
  FILE_SIZE: { label: "文件大小", category: "格式", suggestion: "压缩或拆分超过上限的文件。" },
  DUPLICATE_NAME: { label: "文件名唯一", category: "完整性", suggestion: "消除包内重复文件名后重新检查。" },
  DUPLICATE_HASH: { label: "文件内容唯一", category: "完整性", suggestion: "确认重复内容是否必要，并移除冗余文件。" },
  TRACKED_CHANGES: { label: "修订与批注", category: "元数据", suggestion: "接受全部修订并删除批注后重新导出。" },
  HUMAN_CONFIRMATION: { label: "人工确认记录", category: "人工复核", suggestion: "保留确认原因与原始警告记录。" },
};

function packageNodeStatus(value: unknown): PackageNode["status"] {
  const status = text(value).toLowerCase();
  if (status === "valid" || status === "present") return "valid";
  if (status === "missing") return "missing";
  return "warning";
}

function packageCheckStatus(value: unknown): PackageCheck["status"] {
  const status = text(value).toLowerCase();
  if (status === "pass" || status === "passed") return "passed";
  if (status === "fail" || status === "failed") return "failed";
  return "warning";
}

/** Adapts the existing package item contract, including nested validation results. */
export function mapPackageDto(dto: AnyDto): { tree: PackageNode[]; checks: PackageCheck[] } {
  const items = Array.isArray(dto.items) ? dto.items as AnyDto[] : [];
  const tree = items.map((item, index) => {
    const id = text(item.id, `item-${index}`);
    const name = text(item.name ?? item.filename ?? item.path, `封装项 ${index + 1}`);
    const status = packageNodeStatus(item.status);
    const documentId = text(item.document_id ?? item.documentId);
    return {
      id,
      packageItemId: id,
      name,
      type: "folder" as const,
      status,
      children: documentId
        ? [{
            id: `${id}-document`,
            packageItemId: id,
            name: text(item.document_name ?? item.document_filename, `${name}（已绑定）`),
            type: "file" as const,
            status,
            version: `V${num(item.version ?? item.version_number, 1)}`,
          }]
        : [],
    };
  });
  const nestedChecks = items.flatMap((item, itemIndex) => {
    const itemId = text(item.id, `item-${itemIndex}`);
    const itemName = text(item.name ?? item.filename, `封装项 ${itemIndex + 1}`);
    const results = Array.isArray(item.validation_results) ? item.validation_results as AnyDto[] : [];
    if (!results.length) {
      const status = text(item.status).toLowerCase();
      const required = item.required !== false;
      const missing = status === "missing";
      const invalid = status === "invalid";
      const warning = status === "warning";
      return [{
        id: `${itemId}-state`,
        packageItemId: itemId,
        label: missing ? "必要文件存在" : warning || invalid ? "材料待复核" : "待运行封装检查",
        category: "文件状态",
        status: (missing && required) || invalid ? "failed" as const : "warning" as const,
        file: itemName,
        message: missing
          ? required ? "必需文件缺失。" : "可选文件未提供。"
          : warning || invalid
            ? "当前材料已标记为待复核，请运行封装检查获取具体原因。"
            : "材料已绑定但尚未完成确定性校验，不能视为检查通过。",
        suggestion: missing ? "上传并绑定文件后重新运行检查。" : "运行封装检查以刷新确定性校验结果。",
        sourceRequirement: "封装文件树",
        humanConfirmed: false,
      }];
    }
    return results.map((result, resultIndex) => {
      const code = text(result.code, "PACKAGE_RULE");
      const rule = packageRuleLabels[code] ?? {
        label: code,
        category: "校验",
        suggestion: "按校验提示修复后重新运行检查。",
      };
      return {
        id: `${itemId}-${code}-${resultIndex}`,
        packageItemId: itemId,
        label: rule.label,
        category: rule.category,
        status: packageCheckStatus(result.result ?? result.status),
        file: itemName,
        message: text(result.message, "未提供校验说明。"),
        suggestion: rule.suggestion,
        sourceRequirement: `内部封装规则 ${code}`,
        humanConfirmed: code === "HUMAN_CONFIRMATION",
      };
    });
  });
  const directChecks = Array.isArray(dto.checks ?? dto.validation_results)
    ? (dto.checks ?? dto.validation_results) as AnyDto[]
    : [];
  const checks = directChecks.length
    ? directChecks.map((item, index) => ({
        id: text(item.id, `check-${index}`),
        packageItemId: text(item.package_item_id),
        label: text(item.label ?? item.rule_name),
        category: text(item.category, "校验"),
        status: packageCheckStatus(item.status ?? item.result),
        file: text(item.file ?? item.filename),
        message: text(item.message),
        suggestion: text(item.suggestion ?? item.remediation),
        sourceRequirement: text(item.sourceRequirement ?? item.source_requirement),
        humanConfirmed: Boolean(item.humanConfirmed ?? item.human_confirmed),
      }))
    : nestedChecks;
  return { tree, checks };
}

async function getData<T>(path: string, demoData: T, unavailableData: T, map?: (dto: AnyDto) => unknown): Promise<DataResult<T>> {
  if (!isRemoteApiConfigured) return { data: demoData, source: "demo" };
  try {
    const response = await apiRequest<unknown>(path);
    if (Array.isArray(response)) return { data: (map ? response.map((item) => map(item as AnyDto)) : response) as T, source: "api" };
    if (response && !Array.isArray(response)) return { data: response as T, source: "api" };
    return { data: unavailableData, source: "api", error: "API 返回了无法识别的数据。" };
  } catch (error) {
    return { data: unavailableData, source: "api", error: error instanceof Error ? error.message : "API 请求失败" };
  }
}

async function mutate<T>(path: string, init: RequestInit, demoData: T, demoMessage: string): Promise<ActionResult<T>> {
  if (isRemoteApiConfigured) {
    try { return { data: await apiRequest<T>(path, init), persisted: true, message: "操作已提交后端并进入审计流程。" }; }
    catch (error) { return { data: null, persisted: false, failed: true, message: `后端操作失败，未更改本地状态：${error instanceof Error ? error.message : "未知错误"}。` }; }
  }
  return { data: demoData, persisted: false, message: demoMessage };
}

export const phaseApi = {
  evidence: () => getData<EvidenceAsset[]>("/api/evidence", evidenceAssets, [], mapEvidenceDto),
  evidenceMatches: async (projectId: string): Promise<DataResult<EvidenceMatchGroup[]>> => {
    if (!isRemoteApiConfigured) return { data: evidenceMatchGroups, source: "demo" };
    try {
      const response = await apiRequest<unknown>(`/api/projects/${projectId}/evidence-matches`);
      if (!Array.isArray(response)) return { data: [], source: "api", error: "API 返回了无法识别的数据。" };
      const rows = response as AnyDto[];
      return { data: rows.some((row) => row.match && typeof row.match === "object") ? mapFlatEvidenceMatchRows(rows) : rows.map(mapMatchGroupDto), source: "api" };
    } catch (error) { return { data: [], source: "api", error: error instanceof Error ? error.message : "API 请求失败" }; }
  },
  consistency: (projectId: string) => getData<ConsistencyIssue[]>(`/api/projects/${projectId}/consistency`, consistencyIssues, [], mapConsistencyDto),
  amendments: async (projectId: string): Promise<DataResult<Amendment[]>> => {
    if (!isRemoteApiConfigured) return { data: amendments, source: "demo" };
    try {
      const rows = await apiRequest<AnyDto[]>(`/api/projects/${projectId}/amendments`);
      if (!rows.length) return { data: [], source: "api" };
      const mapped = await Promise.all(rows.map(async (row) => { try { const changes = await apiRequest<AnyDto[]>(`/api/amendments/${text(row.id)}/changes`); return mapAmendmentDto(row, changes.map(mapAmendmentChangeDto)); } catch { return mapAmendmentDto(row); } }));
      return { data: mapped, source: "api" };
    } catch (error) { return { data: [], source: "api", error: error instanceof Error ? error.message : "API 请求失败" }; }
  },
  tasks: (projectId: string) => getData<RemediationTask[]>(`/api/projects/${projectId}/tasks`, remediationTasks, [], mapTaskDto),
  package: async (projectId: string): Promise<DataResult<{ tree: PackageNode[]; checks: PackageCheck[] }>> => {
    if (!isRemoteApiConfigured) return { data: { tree: packageTree, checks: packageChecks }, source: "demo" };
    try {
      const dto = await apiRequest<AnyDto>(`/api/projects/${projectId}/package`);
      return { data: mapPackageDto(dto), source: "api" };
    } catch (error) { return { data: { tree: [], checks: [] }, source: "api", error: error instanceof Error ? error.message : "API 请求失败" }; }
  },
  audit: (projectId: string) => getData<AuditRecord[]>(`/api/projects/${projectId}/audit`, auditRecords, [], mapAuditDto),
  decideMatch: (id: string, decision: "accept" | "reject", reason: string) => mutate(`/api/evidence-matches/${id}/${decision}`, { method: "POST", body: JSON.stringify({ reason }) }, { id, decision }, `本地演示已${decision === "accept" ? "接受" : "拒绝"}匹配；未写入后端。`),
  resolveConsistency: (id: string, status: "resolved" | "accepted_difference", resolution: string) => mutate(`/api/consistency-issues/${id}/resolve`, { method: "POST", body: JSON.stringify({ status, resolution }) }, { id, status }, "本地演示已更新一致性问题；未写入后端。"),
  applyAmendment: (id: string) => mutate<Amendment>(`/api/amendments/${id}/apply`, { method: "POST", body: JSON.stringify({}) }, amendments.find((item) => item.id === id) ?? amendments[0], "本地演示已应用整份公告的变更影响；未写入后端。"),
  rerunCompliance: (projectId: string) => mutate(`/api/projects/${projectId}/compliance/run`, { method: "POST", body: JSON.stringify({ trigger: "amendment" }) }, { status: "demo_complete" }, "本地演示已重新计算受影响项；未写入后端。"),
  createTask: (projectId: string, task: Partial<RemediationTask>, sourceId: string) => mutate(`/api/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify({ source_type: task.sourceType, source_id: sourceId, title: task.title, description: task.reason ?? task.title, priority: task.priority === "critical" ? "fatal" : task.priority, due_at: task.dueDate }) }, { id: `TASK-DEMO-${Date.now()}`, ...task }, "本地演示任务已创建；未写入后端。"),
  updateTask: (id: string, patch: Partial<RemediationTask>, reason: string) => mutate(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ ...(patch.status ? { status: patch.status } : {}), ...(patch.owner ? { owner_name: patch.owner } : {}), ...(patch.dueDate ? { due_at: patch.dueDate } : {}), reason }) }, { id, ...patch }, "本地演示任务已更新；未写入后端。"),
  completeTask: (id: string) => mutate(`/api/tasks/${id}/complete`, { method: "POST", body: JSON.stringify({ note: "提交完成证明，进入复核" }) }, { id, status: "ready_for_review" }, "本地演示任务已提交复核；未写入后端。"),
  reviewTask: (id: string) => mutate(`/api/tasks/${id}/review`, { method: "POST", body: JSON.stringify({ note: "复核通过" }) }, { id, status: "done" }, "本地演示任务已复核完成；未写入后端。"),
  validatePackage: (projectId: string) => mutate(`/api/projects/${projectId}/package/validate`, { method: "POST", body: JSON.stringify({}) }, { checks: packageChecks }, "本地演示已运行确定性封装检查；未写入后端。"),
  previewPackage: async (projectId: string): Promise<ActionResult<{ package_id: string }>> => { const result = await mutate<AnyDto>(`/api/projects/${projectId}/package/preview`, { method: "POST", body: JSON.stringify({}) }, { package_id: "pkg-demo-preview" }, "本地演示预览包已生成。"); if (result.failed) return result; return { ...result, data: { package_id: text(result.data.package_id ?? result.data.id, "pkg-demo-preview") } }; },
  bindPackageItem: (itemId: string, documentId: string) => mutate(`/api/package-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ document_id: documentId, reason: "上传修复文件并绑定封装项" }) }, { id: itemId, document_id: documentId }, "本地演示已绑定修复文件；未写入后端。"),
  downloadPackage: (packageId: string) => apiDownload(`/api/submission-packages/${packageId}/download`),
  buildPackage: async (projectId: string, approved: boolean, approvalReason: string): Promise<ActionResult<{ package_id: string; sha256?: string }>> => { const result = await mutate<AnyDto>(`/api/projects/${projectId}/package/build`, { method: "POST", body: JSON.stringify({ approved, approval_reason: approvalReason }) }, { package_id: "pkg-demo-v4", sha256: "82c12b65a8a03e1a6fd8c1a9aa3f079d" }, "本地演示包已生成，可下载本地 ZIP 和 manifest。"); if (result.failed) return result; return { ...result, data: { package_id: text(result.data.package_id ?? result.data.id, "pkg-demo-v4"), sha256: text(result.data.sha256) || undefined } }; },
  exportAudit: (projectId: string) => apiDownload(`/api/projects/${projectId}/audit/export`),
};
