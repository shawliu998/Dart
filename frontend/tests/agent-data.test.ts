import { agentApi, agentRunBundleFromApiPayload, getLatestAgentRun, type AgentRequest } from "@/lib/api/agent";

const persistedRun = {
  id: "run-1", project_id: "project-1", project_name: "真实项目", workflow_type: "bid_analysis_and_response_v1",
  goal: "提取招标要求", status: "waiting_approval", current_step: "review_requirements", started_at: "2026-07-17T09:00:00Z", updated_at: "2026-07-17T09:02:00Z", created_by: "local-user",
  steps: [{ id: "step-1", step_key: "review_requirements", sequence: 5, status: "waiting_approval", actor_kind: "human_gate", source_references: [{ source_document: "招标文件.pdf", source_page: 8, original_text: "提供证书", extraction_confidence: 0.69 }] }],
  approvals: [{ id: "approval-1", step_run_id: "step-1", approval_type: "compliance_override", status: "pending", title: "复核要求", requested_role: "项目负责人" }],
  artifacts: [{ id: "artifact-1", step_run_id: "step-1", artifact_type: "requirements", title: "要求矩阵", created_at: "2026-07-17T09:02:00Z" }],
};

describe("Agent run API adapter", () => {
  it("maps persisted snake_case runtime data without synthesizing a run", () => {
    const bundle = agentRunBundleFromApiPayload(persistedRun, "project-1");
    expect(bundle.run).toMatchObject({ id: "run-1", projectId: "project-1", status: "waiting_approval", currentStepId: "review_requirements", initiatedBy: "local-user" });
    expect(bundle.run).toMatchObject({ progress: 0, summary: "已完成 0/1 个步骤；等待 1 项人工审批。" });
    expect(bundle.steps[0]).toMatchObject({ status: "waiting_approval", actor: "human_gate", title: "人工复核招标要求", tool: "RequirementsWorkbench" });
    expect(bundle.steps[0].sources?.[0]).toMatchObject({ document: "招标文件.pdf", page: 8, reviewState: "manual_review" });
    expect(bundle.approvals[0]).toMatchObject({ id: "approval-1", status: "pending", requiredRole: "项目负责人" });
    expect(bundle.outputs[0]).toMatchObject({ id: "artifact-1", kind: "requirements" });
  });

  it("maps evidence-match artifact metadata into a candidate evidence output", () => {
    const bundle = agentRunBundleFromApiPayload({
      ...persistedRun,
      artifacts: [{
        id: "artifact-evidence-1", step_run_id: "step-1", artifact_type: "evidence_match_candidates", created_at: "2026-07-17T09:02:00Z",
        metadata_json: {
          count: 2, summary: "已找到待复核的证据候选", href: "/projects/project-1/evidence", severity: "medium",
          provenance: [{ source_document: "资格证明.pdf", source_page: 3, original_text: "ISO 证书", extraction_confidence: 0.82 }],
        },
      }],
    }, "project-1");
    expect(bundle.outputs[0]).toMatchObject({ type: "evidence", kind: "evidence", title: "候选匹配", count: 2, summary: "已找到待复核的证据候选", href: "/projects/project-1/evidence", severity: "medium" });
    expect(bundle.outputs[0].provenance[0]).toMatchObject({ document: "资格证明.pdf", page: 3, reviewState: "rule_result" });
  });

  it("keeps exported artifacts on their real download endpoint", () => {
    const bundle = agentRunBundleFromApiPayload({
      ...persistedRun,
      artifacts: [{ id: "artifact-export-1", step_run_id: "step-1", artifact_type: "compliance_matrix_xlsx", storage_key: "exports/project-1/matrix.xlsx", title: "合规矩阵", created_at: "2026-07-17T09:02:00Z" }],
    }, "project-1");

    expect(bundle.outputs[0].href).toBe("/api/agent-artifacts/artifact-export-1/download");
  });

  it("preserves the explicit evidence and response review approval types", () => {
    const bundle = agentRunBundleFromApiPayload({
      ...persistedRun,
      approvals: [
        { id: "approval-evidence", step_run_id: "step-1", approval_type: "review_evidence_matches", status: "pending" },
        { id: "approval-response", step_run_id: "step-1", approval_type: "review_responses", status: "pending" },
      ],
    }, "project-1");

    expect(bundle.approvals.map((approval) => approval.type)).toEqual(["review_evidence_matches", "review_responses"]);
  });

  it("maps unknown approval types to an explicit safe value", () => {
    const bundle = agentRunBundleFromApiPayload({
      ...persistedRun,
      approvals: [{ id: "approval-unknown", step_run_id: "step-1", approval_type: "new_server_approval", status: "pending" }],
    }, "project-1");

    expect(bundle.approvals[0].type).toBe("unknown");
  });

  it("gets the latest persisted run from the project endpoint", async () => {
    const request = vi.fn(async () => ({ items: [persistedRun] }));
    const result = await getLatestAgentRun("project-1", request as AgentRequest);
    expect(result.source).toBe("api");
    if (result.source === "api") expect(result.data.run.id).toBe("run-1");
    expect(request).toHaveBeenCalledWith("/api/projects/project-1/agent-runs");
  });

  it("reports API errors without falling back to demo data", async () => {
    const result = await getLatestAgentRun("project-1", (async () => { throw new Error("API_503"); }) as AgentRequest);
    expect(result).toMatchObject({ source: "failure", data: null, error: { code: "agent_run_request_failed", retryable: true } });
    if (result.source === "failure") expect(result.error.message).toContain("未自动切换为演示数据");
  });

  it("uses the exact action endpoints and approval reason body", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    await agentApi.cancel("run-1", request as AgentRequest);
    await agentApi.retry("run-1", request as AgentRequest);
    await agentApi.approve("approval-1", { reason: "证据已核验" }, request as AgentRequest);
    await agentApi.reject("approval-1", { reason: "来源不足" }, request as AgentRequest);
    expect(request).toHaveBeenNthCalledWith(1, "/api/agent-runs/run-1/cancel", expect.objectContaining({ method: "POST" }));
    expect(request).toHaveBeenNthCalledWith(2, "/api/agent-runs/run-1/retry", expect.objectContaining({ method: "POST" }));
    expect(request).toHaveBeenNthCalledWith(3, "/api/approvals/approval-1/approve", expect.objectContaining({ body: JSON.stringify({ reason: "证据已核验" }) }));
    expect(request).toHaveBeenNthCalledWith(4, "/api/approvals/approval-1/reject", expect.objectContaining({ body: JSON.stringify({ reason: "来源不足" }) }));
  });
});
