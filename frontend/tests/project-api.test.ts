import { mapDisqualificationDto, mapDocumentDto, mapProjectDto, mapRequirementDto, projectApi } from "@/lib/api/projects";

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

  it("maps document analysis revision and status", () => {
    expect(mapDocumentDto({ id: "d-1", project_id: "p-1", filename: "招标文件.pdf", document_type: "tender_main", mime_type: "application/pdf", size: 20, parse_revision: 2, parse_status: "completed", page_count: 8, created_at: "2026-07-18" })).toMatchObject({ filename: "招标文件.pdf", parseRevision: 2, parseStatus: "completed", pageCount: 8 });
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

  it("starts atomic document reanalysis", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "job-2", status: "queued" }), { status: 202, headers: { "Content-Type": "application/json" } }));
    await expect(projectApi.reanalyzeDocument("doc-1")).resolves.toEqual({ job_id: "job-2", status: "queued" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/documents/doc-1/reanalyze"), expect.objectContaining({ method: "POST" }));
    fetchMock.mockRestore();
  });
});
