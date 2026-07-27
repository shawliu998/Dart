import { apiRequest, isDemoMode } from "./client";
import type { DataResult } from "@/lib/phase-data/types";

type ResponseDto = Record<string, unknown>;

export type ResponseRequirement = {
  code: string | null;
  title: string;
  category: string;
  normalizedText: string;
  mandatory: boolean;
  riskLevel: string;
};

export type RequirementSource = {
  documentId: string;
  filename: string;
  version: number;
  page: number;
  clause: string | null;
  excerpt: string;
  bbox: Record<string, unknown> | null;
};

export type EvidenceSource = {
  claimId: string;
  assetId: string;
  assetName: string;
  documentId: string;
  filename: string;
  documentVersion: number;
  claimType: string;
  subject: string;
  predicate: string;
  value: string;
  validTo: string | null;
  page: number;
  excerpt: string;
  confidence: number;
  humanVerified: boolean;
};

export type TenderResponse = {
  id: string;
  projectId: string;
  requirementId: string;
  status: "not_started" | "drafted" | "needs_review" | "missing_evidence" | "approved" | "excluded";
  strategy: string;
  draftText: string;
  editedText: string | null;
  missingInformation: string[];
  riskNotes: string[];
  confidence: number | null;
  generationVersion: number;
  revisionNumber: number;
  version: number;
  evidenceClaimIds: string[];
  requirement?: ResponseRequirement | null;
  requirementSource?: RequirementSource | null;
  evidenceSources?: EvidenceSource[];
};

export type ResponseRevisionSummary = {
  id: string;
  responseItemId: string;
  revisionNumber: number;
  eventType: "baseline" | "generated" | "edited" | "approved";
  status: TenderResponse["status"];
  generationVersion: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
};

export type ResponseRevision = ResponseRevisionSummary & {
  draftText: string | null;
  editedText: string | null;
};

const value = (input: unknown, fallback = "") => typeof input === "string" ? input : fallback;
const values = (input: unknown) => Array.isArray(input) ? input.map(String) : [];
const object = (input: unknown) => input && typeof input === "object" && !Array.isArray(input) ? input as ResponseDto : null;
const numberOrNull = (input: unknown) => input === null || input === undefined ? null : typeof input === "number" && Number.isFinite(input) ? input : Number.isFinite(Number(input)) ? Number(input) : null;
const boolean = (input: unknown) => input === true;

function mapRequirement(input: unknown): ResponseRequirement | null {
  const dto = object(input);
  if (!dto) return null;
  return { code: typeof dto.code === "string" ? dto.code : null, title: value(dto.title), category: value(dto.category), normalizedText: value(dto.normalized_text ?? dto.normalizedText), mandatory: boolean(dto.mandatory), riskLevel: value(dto.risk_level ?? dto.riskLevel) };
}

function mapRequirementSource(input: unknown): RequirementSource | null {
  const dto = object(input);
  if (!dto) return null;
  const page = numberOrNull(dto.page);
  if (page === null) return null;
  return { documentId: value(dto.document_id ?? dto.documentId), filename: value(dto.filename), version: numberOrNull(dto.version) ?? 1, page, clause: typeof dto.clause === "string" ? dto.clause : null, excerpt: value(dto.excerpt), bbox: object(dto.bbox) };
}

function mapEvidenceSource(input: unknown): EvidenceSource | null {
  const dto = object(input);
  if (!dto) return null;
  const page = numberOrNull(dto.page);
  const confidence = numberOrNull(dto.confidence);
  if (page === null || confidence === null) return null;
  return { claimId: value(dto.claim_id ?? dto.claimId), assetId: value(dto.asset_id ?? dto.assetId), assetName: value(dto.asset_name ?? dto.assetName), documentId: value(dto.document_id ?? dto.documentId), filename: value(dto.filename), documentVersion: numberOrNull(dto.document_version ?? dto.documentVersion) ?? 1, claimType: value(dto.claim_type ?? dto.claimType), subject: value(dto.subject), predicate: value(dto.predicate), value: value(dto.value), validTo: typeof (dto.valid_to ?? dto.validTo) === "string" ? value(dto.valid_to ?? dto.validTo) : null, page, excerpt: value(dto.excerpt), confidence, humanVerified: boolean(dto.human_verified ?? dto.humanVerified) };
}

export function mapResponseDto(dto: ResponseDto): TenderResponse {
  const status = value(dto.status, "not_started") as TenderResponse["status"];
  return {
    id: value(dto.id), projectId: value(dto.project_id ?? dto.projectId), requirementId: value(dto.requirement_id ?? dto.requirementId), status,
    strategy: value(dto.response_strategy ?? dto.responseStrategy, "待人工确定响应策略"),
    draftText: value(dto.draft_text ?? dto.draftText), editedText: typeof (dto.edited_text ?? dto.editedText) === "string" ? value(dto.edited_text ?? dto.editedText) : null,
    missingInformation: values(dto.missing_information ?? dto.missingInformation), riskNotes: values(dto.risk_notes ?? dto.riskNotes),
    confidence: typeof dto.confidence === "number" ? dto.confidence : dto.confidence === null ? null : Number.isFinite(Number(dto.confidence)) ? Number(dto.confidence) : null,
    generationVersion: Number(dto.generation_version ?? dto.generationVersion ?? 1), revisionNumber: Number(dto.revision_number ?? dto.revisionNumber ?? 1), version: Number(dto.version ?? 1), evidenceClaimIds: values(dto.evidence_claim_ids ?? dto.evidenceClaimIds),
    requirement: mapRequirement(dto.requirement), requirementSource: mapRequirementSource(dto.requirement_source ?? dto.requirementSource),
    evidenceSources: evidenceSourceRows(dto).map(mapEvidenceSource).filter((source): source is EvidenceSource => source !== null),
  };
}

function mapRevisionSummary(dto: ResponseDto): ResponseRevisionSummary {
  return {
    id: value(dto.id),
    responseItemId: value(dto.response_item_id ?? dto.responseItemId),
    revisionNumber: Number(dto.revision_number ?? dto.revisionNumber ?? 1),
    eventType: value(dto.event_type ?? dto.eventType, "baseline") as ResponseRevisionSummary["eventType"],
    status: value(dto.status, "not_started") as TenderResponse["status"],
    generationVersion: Number(dto.generation_version ?? dto.generationVersion ?? 1),
    createdBy: value(dto.created_by ?? dto.createdBy),
    createdByName: typeof (dto.created_by_name ?? dto.createdByName) === "string" ? value(dto.created_by_name ?? dto.createdByName) : null,
    createdAt: value(dto.created_at ?? dto.createdAt),
  };
}

function mapRevision(dto: ResponseDto): ResponseRevision {
  return {
    ...mapRevisionSummary(dto),
    draftText: typeof (dto.draft_text ?? dto.draftText) === "string" ? value(dto.draft_text ?? dto.draftText) : null,
    editedText: typeof (dto.edited_text ?? dto.editedText) === "string" ? value(dto.edited_text ?? dto.editedText) : null,
  };
}

function evidenceSourceRows(dto: ResponseDto): unknown[] {
  const rows = dto.evidence_sources ?? dto.evidenceSources;
  return Array.isArray(rows) ? rows : [];
}

async function list(projectId: string): Promise<DataResult<TenderResponse[]>> {
  if (isDemoMode) return { data: [], source: "demo" };
  try {
    const rows = await apiRequest<unknown>(`/api/projects/${projectId}/responses`);
    if (!Array.isArray(rows)) return { data: [], source: "api", error: "API 返回了无法识别的响应草稿数据。" };
    return { data: rows.map((row) => mapResponseDto(row as ResponseDto)), source: "api" };
  } catch (error) {
    return { data: [], source: "api", error: error instanceof Error ? error.message : "API 请求失败" };
  }
}

export const responseApi = {
  list,
  async save(id: string, editedText: string, reason: string): Promise<TenderResponse> {
    return mapResponseDto(await apiRequest<ResponseDto>(`/api/responses/${id}`, { method: "PATCH", body: JSON.stringify({ edited_text: editedText, reason }) }));
  },
  async approve(id: string, reason: string): Promise<TenderResponse> {
    return mapResponseDto(await apiRequest<ResponseDto>(`/api/responses/${id}/approve`, { method: "POST", body: JSON.stringify({ reason }) }));
  },
  async listRevisions(id: string): Promise<ResponseRevisionSummary[]> {
    const rows = await apiRequest<unknown>(`/api/responses/${id}/revisions`);
    if (!Array.isArray(rows)) throw new Error("API 返回了无法识别的版本记录。");
    return rows.map((row) => mapRevisionSummary(row as ResponseDto));
  },
  async getRevision(id: string, revisionNumber: number): Promise<ResponseRevision> {
    return mapRevision(await apiRequest<ResponseDto>(`/api/responses/${id}/revisions/${revisionNumber}`));
  },
};
