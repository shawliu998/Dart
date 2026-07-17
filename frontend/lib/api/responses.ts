import { apiRequest, isDemoMode } from "./client";
import type { DataResult } from "@/lib/phase-data/types";

type ResponseDto = Record<string, unknown>;

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
  version: number;
  evidenceClaimIds: string[];
};

const value = (input: unknown, fallback = "") => typeof input === "string" ? input : fallback;
const values = (input: unknown) => Array.isArray(input) ? input.map(String) : [];

export function mapResponseDto(dto: ResponseDto): TenderResponse {
  const status = value(dto.status, "not_started") as TenderResponse["status"];
  return {
    id: value(dto.id), projectId: value(dto.project_id ?? dto.projectId), requirementId: value(dto.requirement_id ?? dto.requirementId), status,
    strategy: value(dto.response_strategy ?? dto.responseStrategy, "待人工确定响应策略"),
    draftText: value(dto.draft_text ?? dto.draftText), editedText: typeof (dto.edited_text ?? dto.editedText) === "string" ? value(dto.edited_text ?? dto.editedText) : null,
    missingInformation: values(dto.missing_information ?? dto.missingInformation), riskNotes: values(dto.risk_notes ?? dto.riskNotes),
    confidence: typeof dto.confidence === "number" ? dto.confidence : dto.confidence === null ? null : Number.isFinite(Number(dto.confidence)) ? Number(dto.confidence) : null,
    generationVersion: Number(dto.generation_version ?? dto.generationVersion ?? 1), version: Number(dto.version ?? 1), evidenceClaimIds: values(dto.evidence_claim_ids ?? dto.evidenceClaimIds),
  };
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
};
