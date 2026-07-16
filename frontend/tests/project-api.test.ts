import { mapDisqualificationDto, mapProjectDto, mapRequirementDto, projectApi } from "@/lib/api/projects";

describe("backend DTO adapters", () => {
  it("maps snake_case project fields into the UI model", () => {
    const project = mapProjectDto({ id: "p-1", name: "测试项目", buyer_name: "采购人", project_code: "ZB-01", current_stage: "parsed", completion_percentage: 35, risk_level: "high", updated_at: "2026-07-16" });
    expect(project).toMatchObject({ buyerName: "采购人", projectCode: "ZB-01", stage: "parsed", progress: 35, risk: "high", updatedAt: "2026-07-16" });
  });

  it("maps requirement source and review-safe defaults", () => {
    const requirement = mapRequirementDto({ id: "r-1", requirement_code: "REQ-9", title: "签章要求", original_text: "必须盖章", source_page: 12, disqualification_if_failed: true, extraction_confidence: 0.66, review_status: "manual_review" });
    expect(requirement).toMatchObject({ code: "REQ-9", originalText: "必须盖章", page: 12, disqualification: true, status: "review" });
    expect(requirement.confidence).toBe(0.66);
  });

  it("maps backend disqualification shape without treating it as the UI model", () => {
    expect(mapDisqualificationDto({ id: "d-1", trigger_description: "报价超限", severity: "fatal", decision: "rule_hit", detected_keywords: ["无效投标"] })).toMatchObject({ title: "报价超限", risk: "fatal", status: "rule_hit" });
  });

  it("normalizes backend job id for polling", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "job-1", status: "queued" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(projectApi.parseDocument("doc-1")).resolves.toEqual({
      job_id: "job-1",
      status: "queued",
    });
    fetchMock.mockRestore();
  });
});
