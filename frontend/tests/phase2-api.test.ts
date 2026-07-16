import { mapAmendmentChangeDto, mapEvidenceDto, mapMatchGroupDto, mapTaskDto } from "@/lib/api/phase2";

describe("Phase 2-5 DTO adapters", () => {
  it("maps backend evidence status and snake_case claims", () => {
    const asset = mapEvidenceDto({ id: "e-1", filename: "证书.pdf", evidence_type: "管理体系", legal_entity: "上海智园数字科技有限公司", status: "active", valid_until: "2027-01-01", claims: [{ id: "c-1", claim_type: "有效期", claim_value: "2027-01-01", source_page: 2, confidence: .98 }] });
    expect(asset).toMatchObject({ name: "证书.pdf", legalEntity: "上海智园数字科技有限公司", status: "verified", validUntil: "2027-01-01" });
    expect(asset.claims[0]).toMatchObject({ label: "有效期", page: 2, confidence: .98 });
  });

  it("maps task fatal priority, review state and due_at", () => {
    const task = mapTaskDto({ id: "t-1", title: "复核证书", priority: "fatal", status: "ready_for_review", due_at: "2026-07-20", source_type: "evidence", description: "证书过期" });
    expect(task).toMatchObject({ priority: "critical", status: "review", dueDate: "2026-07-20", reason: "证书过期" });
  });

  it("maps match candidates and amendment changes explicitly", () => {
    const group = mapMatchGroupDto({ requirement_id: "r-1", requirement_code: "REQ-1", requirement_title: "资质", matches: [{ id: "m-1", evidence_id: "e-1", evidence_name: "证书.pdf", match_score: .93, match_reasons: ["类型一致"] }] });
    expect(group.candidates[0]).toMatchObject({ evidenceId: "e-1", score: .93, reason: ["类型一致"] });
    expect(mapAmendmentChangeDto({ id: "a-1", change_type: "modified", before_text: "5000", after_text: "8000", affects_price: true })).toMatchObject({ type: "modified", before: "5000", after: "8000", affectsPrice: true });
  });
});
