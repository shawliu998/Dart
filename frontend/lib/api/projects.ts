import { disqualifications, projects, requirements } from "@/lib/demo/data";
import type { DisqualificationItem, Project, Requirement } from "@/lib/types";
import { apiRequest, isDemoMode } from "./client";

const useDemo = isDemoMode;

type ProjectDto = Partial<Project> & {
  buyer_name?: string;
  project_code?: string;
  current_stage?: string;
  completion_percentage?: number;
  high_risk_count?: number;
  task_count?: number;
  risk_level?: Project["risk"];
  updated_at?: string;
};

type RequirementDto = Partial<Requirement> & {
  requirement_code?: string;
  disqualification_if_failed?: boolean;
  risk_level?: Requirement["risk"];
  current_status?: Requirement["status"];
  best_evidence?: string | null;
  source_page?: number;
  clause_number?: string;
  original_text?: string;
  normalized_requirement?: string;
  expected_evidence?: string;
  actual_value?: string;
  rule_name?: string;
  source_document?: string;
  source_version?: string;
  extraction_confidence?: number;
  review_status?: string;
};

type DisqualificationDto = Partial<DisqualificationItem> & {
  requirement_id?: string;
  trigger_description?: string;
  severity?: DisqualificationItem["risk"];
  decision?: string;
  detected_keywords?: string[];
};

type JobDto = {
  id?: string;
  job_id?: string;
  status?: string;
};

export type ProjectDocument = {
  id: string;
  projectId: string;
  filename: string;
  documentType: string;
  mimeType: string;
  size: number;
  parseRevision: number;
  parseStatus: string;
  pageCount: number;
  createdAt: string;
};

type DocumentDto = {
  id: string;
  project_id: string;
  filename: string;
  document_type: string;
  mime_type: string;
  size: number;
  parse_revision: number;
  parse_status: string;
  page_count: number;
  created_at: string;
};

export function mapDocumentDto(dto: DocumentDto): ProjectDocument {
  return {
    id: dto.id,
    projectId: dto.project_id,
    filename: dto.filename,
    documentType: dto.document_type,
    mimeType: dto.mime_type,
    size: dto.size,
    parseRevision: dto.parse_revision,
    parseStatus: dto.parse_status,
    pageCount: dto.page_count,
    createdAt: dto.created_at,
  };
}

const reviewStatusMap: Record<string, Requirement["status"]> = {
  satisfied: "met", missing_evidence: "missing", manual_review: "review", unreviewed: "review", not_satisfied: "failed", conflict: "conflict",
};

const projectStageMap: Record<string, string> = {
  file_ingestion: "文件导入",
  ingesting: "文件导入",
  requirement_review: "要求确认",
  compliance_review: "合规审阅",
  evidence_matching: "证据匹配",
  response_drafting: "标书编制",
  remediation: "整改处理",
  packaging: "文件封装",
  final_review: "最终复核",
  completed: "已完成",
};

function formatShanghaiDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

export function mapProjectDto(dto: ProjectDto): Project {
  const rawStage = String(dto.stage ?? dto.current_stage ?? "draft");
  return {
    id: String(dto.id ?? ""), name: String(dto.name ?? "未命名项目"),
    buyerName: String(dto.buyerName ?? dto.buyer_name ?? "未填写采购人"),
    projectCode: String(dto.projectCode ?? dto.project_code ?? "未编号"),
    stage: projectStageMap[rawStage] ?? rawStage,
    progress: Number(dto.progress ?? dto.completion_percentage ?? 0),
    highRiskCount: Number(dto.highRiskCount ?? dto.high_risk_count ?? 0),
    taskCount: Number(dto.taskCount ?? dto.task_count ?? 0),
    deadline: formatShanghaiDate(dto.deadline, "待确定"), owner: String(dto.owner ?? "未分配"),
    updatedAt: formatShanghaiDate(dto.updatedAt ?? dto.updated_at, "刚刚"),
    risk: dto.risk ?? dto.risk_level ?? "low",
  };
}

export function mapRequirementDto(dto: RequirementDto): Requirement {
  return {
    id: String(dto.id ?? ""), code: String(dto.code ?? dto.requirement_code ?? "REQ"), title: String(dto.title ?? "未命名要求"), category: String(dto.category ?? "其他"),
    mandatory: Boolean(dto.mandatory), disqualification: Boolean(dto.disqualification ?? dto.disqualification_if_failed), risk: dto.risk ?? dto.risk_level ?? "low",
    status: dto.status ?? dto.current_status ?? reviewStatusMap[dto.review_status ?? ""] ?? "review", evidence: dto.evidence ?? dto.best_evidence ?? null, confidence: Number(dto.confidence ?? dto.extraction_confidence ?? 0), owner: String(dto.owner ?? "未分配"), dueDate: String(dto.dueDate ?? "待确定"),
    page: Number(dto.page ?? dto.source_page ?? 1), clause: String(dto.clause ?? dto.clause_number ?? "未编号"), originalText: String(dto.originalText ?? dto.original_text ?? "暂无原文"),
    normalizedText: String(dto.normalizedText ?? dto.normalized_requirement ?? "待人工标准化"), expectedEvidence: String(dto.expectedEvidence ?? dto.expected_evidence ?? "待确认"), actualValue: String(dto.actualValue ?? dto.actual_value ?? "尚未核验"),
    rule: String(dto.rule ?? dto.rule_name ?? "人工复核"), reasoning: String(dto.reasoning ?? "等待人工复核"), sourceDocument: String(dto.sourceDocument ?? dto.source_document ?? "招标文件"), sourceVersion: String(dto.sourceVersion ?? dto.source_version ?? "V1.0"),
  };
}

export function mapDisqualificationDto(dto: DisqualificationDto): DisqualificationItem {
  const decision = dto.decision ?? "candidate";
  const status: DisqualificationItem["status"] = decision === "confirmed" ? "confirmed" : decision === "resolved" ? "resolved" : decision === "waived" || decision === "rejected" ? "waived" : decision === "rule_hit" ? "rule_hit" : "candidate";
  return {
    id: String(dto.id ?? dto.requirement_id ?? ""), title: String(dto.title ?? dto.trigger_description ?? "待确认否决项"), status,
    risk: dto.risk ?? dto.severity ?? "high", source: String(dto.source ?? "关联招标要求"), page: Number(dto.page ?? 1),
    trigger: String(dto.trigger ?? dto.trigger_description ?? "等待人工核验触发条件"), evidence: String(dto.evidence ?? `检测关键词：${dto.detected_keywords?.join("、") || "无"}`),
    response: String(dto.response ?? "尚未形成正式判断"), remediation: String(dto.remediation ?? "请打开关联要求并补充整改措施"), owner: String(dto.owner ?? "未分配"), dueDate: String(dto.dueDate ?? "待确定"), approver: String(dto.approver ?? "待分配"),
  };
}

async function remoteOrFallback<TDto, TUi>(request: () => Promise<TDto[]>, fallback: TUi[], map: (dto: TDto) => TUi): Promise<TUi[]> {
  if (useDemo) return fallback;
  return (await request()).map(map);
}

export const projectApi = {
  async list(): Promise<Project[]> {
    return remoteOrFallback(() => apiRequest<ProjectDto[]>("/api/projects"), projects, mapProjectDto);
  },
  async get(projectId: string): Promise<Project> {
    const fallback = projects.find((project) => project.id === projectId) ?? projects[0];
    if (useDemo) return fallback;
    return mapProjectDto(await apiRequest<ProjectDto>(`/api/projects/${projectId}`));
  },
  async requirements(projectId: string): Promise<Requirement[]> {
    return remoteOrFallback(() => apiRequest<RequirementDto[]>(`/api/projects/${projectId}/requirements`), requirements, mapRequirementDto);
  },
  async disqualifications(projectId: string): Promise<DisqualificationItem[]> {
    return remoteOrFallback(() => apiRequest<DisqualificationDto[]>(`/api/projects/${projectId}/disqualifications`), disqualifications, mapDisqualificationDto);
  },
  async documents(projectId: string): Promise<ProjectDocument[]> {
    if (useDemo) return [];
    return (await apiRequest<DocumentDto[]>(`/api/projects/${projectId}/documents`)).map(mapDocumentDto);
  },
  async create(input: { name: string; projectCode?: string; buyerName?: string }): Promise<Project> {
    const dto = await apiRequest<ProjectDto>("/api/projects", { method: "POST", body: JSON.stringify({ name: input.name, project_code: input.projectCode || "待提取", buyer_name: input.buyerName || "待提取", status: "draft", current_stage: "ingesting" }) });
    return mapProjectDto(dto);
  },
  async uploadDocument(projectId: string, file: File, documentType = "tender_main"): Promise<{ id: string }> {
    const body = new FormData(); body.append("file", file); body.append("document_type", documentType);
    return apiRequest<{ id: string }>(`/api/projects/${projectId}/documents`, { method: "POST", body });
  },
  async parseDocument(documentId: string): Promise<{ job_id?: string; status?: string }> {
    const job = await apiRequest<JobDto>(`/api/documents/${documentId}/parse`, { method: "POST" });
    return { job_id: job.job_id ?? job.id, status: job.status };
  },
  async reanalyzeDocument(documentId: string): Promise<{ job_id?: string; status?: string }> {
    const job = await apiRequest<JobDto>(`/api/documents/${documentId}/reanalyze`, { method: "POST" });
    return { job_id: job.job_id ?? job.id, status: job.status };
  },
  async extractRequirements(projectId: string, documentId: string): Promise<{ job_id?: string; status?: string }> {
    const job = await apiRequest<JobDto>(`/api/projects/${projectId}/requirements/extract`, { method: "POST", body: JSON.stringify({ document_id: documentId }) });
    return { job_id: job.job_id ?? job.id, status: job.status };
  },
  async detectDisqualifications(projectId: string): Promise<{ job_id?: string; status?: string }> {
    return apiRequest<{ job_id?: string; status?: string }>(`/api/projects/${projectId}/disqualifications/detect`, { method: "POST", body: JSON.stringify({}) });
  },
  async job(jobId: string): Promise<{ status: string; progress?: number; current_step?: string; error?: string }> {
    return apiRequest<{ status: string; progress?: number; current_step?: string; error?: string }>(`/api/jobs/${jobId}`);
  },
};
