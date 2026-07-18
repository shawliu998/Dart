import { mapFlatEvidenceMatchRows, phaseApi, mapAmendmentChangeDto, mapEvidenceDto, mapMatchGroupDto, mapTaskDto } from "@/lib/api/phase2";
import { vi } from "vitest";

describe("Phase 2-5 DTO adapters", () => {
  it("maps backend evidence status and snake_case claims", () => {
    const asset = mapEvidenceDto({ id: "e-1", filename: "证书.pdf", evidence_type: "管理体系", legal_entity: "上海智园数字科技有限公司", status: "active", valid_until: "2027-01-01", claims: [{ id: "c-1", claim_type: "有效期", claim_value: "2027-01-01", source_page: 2, confidence: .98 }] });
    expect(asset).toMatchObject({ name: "证书.pdf", legalEntity: "上海智园数字科技有限公司", status: "verified", validUntil: "2027-01-01" });
    expect(asset.claims[0]).toMatchObject({ label: "有效期", page: 2, confidence: .98 });
  });

  it("maps task fatal priority, review state and due_at", () => {
    const task = mapTaskDto({ id: "t-1", title: "复核证书", priority: "fatal", status: "ready_for_review", due_at: "2026-07-20", source_type: "evidence", description: "证书过期" });
    expect(task).toMatchObject({ priority: "critical", status: "review", dueDate: "2026-07-20", reason: "证书过期" });
    const ocrTask = mapTaskDto({ id: "t-2", title: "补充OCR文本", source_type: "agent_ocr_required" });
    expect(ocrTask).toMatchObject({ sourceType: "agent_ocr_required", sourceLabel: "agent_ocr_required" });
  });

  it("maps match candidates and amendment changes explicitly", () => {
    const group = mapMatchGroupDto({ requirement_id: "r-1", requirement_code: "REQ-1", requirement_title: "资质", matches: [{ id: "m-1", evidence_id: "e-1", evidence_name: "证书.pdf", match_score: .93, match_reasons: ["类型一致"] }] });
    expect(group.candidates[0]).toMatchObject({ evidenceId: "e-1", score: .93, reason: ["类型一致"] });
    expect(mapAmendmentChangeDto({ id: "a-1", change_type: "modified", before_text: "5000", after_text: "8000", affects_price: true })).toMatchObject({ type: "modified", before: "5000", after: "8000", affectsPrice: true });
  });

  it("groups flat evidence match rows and preserves human decisions", () => {
    const groups = mapFlatEvidenceMatchRows([
      { match: { id: "m-1", requirement_id: "r-1", match_score: .93, status: "accepted", reason: "类型匹配", human_reason: "复核通过" }, requirement: { id: "r-1", requirement_code: "REQ-1", title: "资质", risk_level: "high", source_page: 8 }, claim: { evidence_asset_id: "e-1" }, asset: { id: "e-1", name: "证书.pdf", legal_entity: "上海智园数字科技有限公司", expiry_date: "2027-01-01" } },
      { match: { id: "m-2", requirement_id: "r-1", match_score: .72, human_decision: "rejected", reason: "主体不一致", human_reason: "法人不符" }, requirement: { id: "r-1", requirement_code: "REQ-1", title: "资质", risk_level: "high", source_page: 8 }, claim: { evidence_asset_id: "e-2" }, asset: { id: "e-2", name: "另一份证书.pdf" } },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "r-1", requirementCode: "REQ-1", selectedEvidenceIds: ["e-1"] });
    expect(groups[0].candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "m-1", evidenceId: "e-1", decision: "accepted", reason: ["类型匹配", "复核通过"] }),
      expect.objectContaining({ id: "m-2", evidenceId: "e-2", decision: "rejected", reason: ["主体不一致", "法人不符"] }),
    ]));
  });

  it("does not substitute demo evidence when the API fails outside demo mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));
    const result = await phaseApi.evidence();
    expect(result).toMatchObject({ source: "api", data: [], error: "API_503" });
    expect(result.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "EVD-001" })]));
    fetchMock.mockRestore();
  });
});
