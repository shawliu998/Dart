import { aggregateAgentRun, snapshotFromAgentApiPayload, type AgentRequest } from "@/lib/api/agent";
import { createAgentRunBundle, resolveAgentProjectId } from "@/lib/agent";

describe("Agent run data contract", () => {
  it("keeps a valid project query and rejects unsafe or malformed context", () => {
    const fallback = "8b6b7330-8fe3-4a95-85df-2a5a9183fe01";
    expect(resolveAgentProjectId("9ce15e5b-3568-4a07-b621-77f7672133a2", fallback)).toBe("9ce15e5b-3568-4a07-b621-77f7672133a2");
    expect(resolveAgentProjectId("../../api/secrets", fallback)).toBe(fallback);
  });

  it("keeps the prompt-defined run, step, approval and output contracts", () => {
    const bundle = createAgentRunBundle("project-1");
    expect(bundle.run.status).toBe("waiting_approval");
    expect(bundle.run).toMatchObject({ projectId: "project-1", projectName: expect.any(String), goal: expect.any(String), initiatedBy: expect.any(String) });
    expect(bundle.run.steps).toBe(bundle.steps);
    expect(bundle.run.approvals).toBe(bundle.approvals);
    expect(bundle.run.outputs).toBe(bundle.outputs);
    expect(bundle.steps.every((step) => ["pending", "running", "completed", "failed", "blocked"].includes(step.status))).toBe(true);
    expect(bundle.approvals[0]).toMatchObject({ type: "compliance_override", description: expect.any(String), impactSummary: expect.any(String), reversible: true, sourceReferences: expect.any(Array) });
    expect(bundle.outputs[0]).toMatchObject({ type: "requirement", description: expect.any(String), href: "/projects/project-1/requirements" });
  });

  it("derives counts and the manual-review source from mixed API field styles", () => {
    const snapshot = snapshotFromAgentApiPayload({
      requirements: [
        { id: "r1", risk_level: "fatal", current_status: "failed", source_document: "招标文件.pdf", source_page: 8, original_text: "报价不得超过限价", extraction_confidence: 0.92 },
        { id: "r2", risk: "high", status: "review", sourceDocument: "招标文件.pdf", page: 21, originalText: "提供证书", confidence: 0.69 },
      ],
      evidenceMatches: [{ matches: [{ decision: "pending" }, { decision: "accepted" }] }],
      consistency: [{ status: "open" }, { status: "resolved" }],
      amendments: [{ changes: [{ status: "pending" }, { status: "applied" }] }],
      tasks: [{ status: "todo" }, { status: "done" }],
      packageResult: { checks: [{ status: "failed" }, { status: "passed" }] },
      audit: [{ timestamp: "2026-07-16 14:31" }],
    });
    expect(snapshot).toMatchObject({ requirementCount: 2, reviewRequirementCount: 1, fatalRequirementCount: 1, pendingMatchCount: 1, openConsistencyCount: 1, pendingAmendmentCount: 1, openTaskCount: 1, failedPackageCheckCount: 1, auditEventCount: 1 });
    expect(snapshot.primarySource).toMatchObject({ page: 21, confidence: 0.69, reviewState: "manual_review" });
  });

  it("returns demo only when the remote API is not configured", async () => {
    const request = vi.fn();
    const result = await aggregateAgentRun("project-demo", request as unknown as AgentRequest, false);
    expect(result.source).toBe("demo");
    expect(request).not.toHaveBeenCalled();
  });

  it("returns API data when every aggregation endpoint succeeds", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/requirements")) return [{ risk: "fatal", status: "failed", confidence: 0.95 }];
      if (path.endsWith("/evidence-matches")) return [{ candidates: [{ decision: "pending" }] }];
      if (path.endsWith("/package")) return { checks: [{ status: "failed" }] };
      return [];
    });
    const result = await aggregateAgentRun("project-api", request as unknown as AgentRequest, true);
    expect(result.source).toBe("api");
    if (result.source === "api") expect(result.data.run.projectId).toBe("project-api");
    expect(request).toHaveBeenCalledTimes(7);
  });

  it("reports failure without silently substituting demo data", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/consistency")) throw new Error("API_503");
      return [];
    });
    const result = await aggregateAgentRun("project-failure", request as unknown as AgentRequest, true);
    expect(result).toMatchObject({ source: "failure", data: null, error: { code: "agent_aggregation_failed", retryable: true } });
    if (result.source === "failure") expect(result.error.message).toContain("未自动切换为演示数据");
  });
});
