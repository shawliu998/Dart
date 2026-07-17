import { agentApi, agentEventsFromApiPayload, agentRunBundleFromApiPayload, createAgentRun, getLatestAgentRun, type AgentRequest } from "@/lib/api/agent";

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
    expect(bundle.run).toMatchObject({ id: "run-1", projectId: "project-1", status: "waiting_approval", currentStepId: "review_requirements", initiatedBy: "local-user", mode: "supervised", scope: "full_bid_draft", maxIterations: 20 });
    expect(bundle.run).toMatchObject({ progress: 0, summary: "已完成 0/1 个步骤；等待 1 项人工审批。" });
    expect(bundle.steps[0]).toMatchObject({ status: "waiting_approval", actor: "human_gate", title: "人工复核招标要求", tool: "RequirementsWorkbench" });
    expect(bundle.steps[0].sources?.[0]).toMatchObject({ document: "招标文件.pdf", page: 8, reviewState: "manual_review" });
    expect(bundle.approvals[0]).toMatchObject({ id: "approval-1", status: "pending", requiredRole: "项目负责人" });
    expect(bundle.outputs[0]).toMatchObject({ id: "artifact-1", kind: "requirements" });
  });

  it("maps autonomous snake_case command-center fields", () => {
    const bundle = agentRunBundleFromApiPayload({ ...persistedRun, mode: "autonomous_draft", scope: "full_bid_draft", outcome: "partial", max_iterations: 12, current_iteration: 3, current_action: "提取项目摘要", next_action: "抽取招标要求", last_observation: "已识别 2 处主体名称差异", agent_summary: "正在生成内部草稿", plan_json: { stages: [{ key: "understand", title: "理解文件", status: "completed" }, { key: "evidence", title: "证据核验", status: "in_progress" }, { key: "unknown", status: "completed" }, { key: "draft", status: "server_future_state" }] } }, "project-1");
    expect(bundle.run).toMatchObject({ mode: "autonomous_draft", scope: "full_bid_draft", outcome: "partial", maxIterations: 12, iteration: 3, currentAction: "提取项目摘要", nextAction: "抽取招标要求", observation: "已识别 2 处主体名称差异", summary: "正在生成内部草稿" });
    expect(bundle.run.planStages).toEqual([{ key: "understand", title: "理解文件", status: "completed" }, { key: "evidence", title: "证据核验", status: "in_progress" }]);
  });

  it("maps append-only events, omitting incomplete rows without inventing a timestamp", () => {
    expect(agentEventsFromApiPayload([
      { sequence: 2, event_type: "response_quality.pass_completed", payload: { pass: 2 }, created_at: "2026-07-17T09:02:00Z" },
      { sequence: 1, event_type: "review.deferred", payload: { reason: "等待人工确认" }, created_at: "2026-07-17T09:01:00Z" },
      { sequence: 3, event_type: "tool.completed", payload: {} },
    ])).toEqual([
      { sequence: 1, eventType: "review.deferred", payload: { reason: "等待人工确认" }, timestamp: "2026-07-17T09:01:00Z" },
      { sequence: 2, eventType: "response_quality.pass_completed", payload: { pass: 2 }, timestamp: "2026-07-17T09:02:00Z" },
    ]);
  });

  it("posts autonomous launch options using the backend snake_case contract", async () => {
    const request = vi.fn(async () => persistedRun);
    await createAgentRun("project-1", { goal: "生成响应草稿", mode: "autonomous_draft", scope: "full_bid_draft", maxIterations: 9 }, request as AgentRequest);
    expect(request).toHaveBeenCalledWith("/api/projects/project-1/agent-runs", expect.objectContaining({ method: "POST", body: JSON.stringify({ goal: "生成响应草稿", mode: "autonomous_draft", scope: "full_bid_draft", max_iterations: 9 }) }));
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

  it("maps response-quality results to the response workbench with issue and repaired counts", () => {
    const bundle = agentRunBundleFromApiPayload({
      ...persistedRun,
      artifacts: [{
        id: "artifact-quality-1", step_run_id: "step-1", artifact_type: "response_quality_check", created_at: "2026-07-17T09:02:00Z",
        metadata_json: { issue_count: 3, repaired_count: 1, manual_review_required: true, after_summary: "仍有 3 项需要人工复核。" },
      }],
    }, "project-1");

    expect(bundle.outputs[0]).toMatchObject({
      title: "响应草稿质量自查", kind: "audit", count: 3, severity: "high", href: "/projects/project-1/responses", artifactType: "response_quality_check",
      metrics: { qualityIssueCount: 3, qualityRepairedCount: 1 },
    });
    expect(bundle.outputs[0].summary).toContain("剩余 3 项质量问题");
    expect(bundle.outputs[0].summary).toContain("已自动修补 1 项安全标注");
  });

  it("maps evidence-claims artifact into the evidence workbench with manual-review state", () => {
    const bundle = agentRunBundleFromApiPayload({
      ...persistedRun,
      artifacts: [{
        id: "artifact-claims-1", step_run_id: "step-1", artifact_type: "evidence_claims", created_at: "2026-07-17T09:02:00Z",
        metadata_json: { asset_count: 5, new_claim_count: 12, failed_assets: ["过期证书.pdf"], review_state: "manual_review" },
      }],
    }, "project-1");

    expect(bundle.outputs[0]).toMatchObject({
      title: "企业材料 Claim", type: "evidence", kind: "evidence", count: 12, severity: "high", href: "/projects/project-1/evidence-matching", artifactType: "evidence_claims",
      metrics: { assetCount: 5, newClaimCount: 12, failedAssetCount: 1 },
    });
    expect(bundle.outputs[0].summary).toContain("已处理 5 份企业材料");
    expect(bundle.outputs[0].summary).toContain("1 份材料抽取失败");
  });

  it("maps response-drafts artifact into the response workbench", () => {
    const bundle = agentRunBundleFromApiPayload({
      ...persistedRun,
      artifacts: [{
        id: "artifact-responses-1", step_run_id: "step-1", artifact_type: "response_drafts", created_at: "2026-07-17T09:02:00Z",
        metadata_json: { count: 8, missing_evidence_count: 2, href: "/projects/project-1/responses" },
      }],
    }, "project-1");

    expect(bundle.outputs[0]).toMatchObject({
      title: "投标响应草稿", type: "report", kind: "audit", count: 8, severity: "medium", href: "/projects/project-1/responses", artifactType: "response_drafts",
      metrics: { responseCount: 8, missingEvidenceCount: 2 },
    });
    expect(bundle.outputs[0].summary).toContain("共生成 8 条响应草稿");
    expect(bundle.outputs[0].summary).toContain("2 条缺少证据链接");
  });

  it("maps remediation-tasks artifact into the project tasks workbench", () => {
    const bundle = agentRunBundleFromApiPayload({
      ...persistedRun,
      artifacts: [{
        id: "artifact-tasks-1", step_run_id: "step-1", artifact_type: "remediation_tasks", created_at: "2026-07-17T09:02:00Z",
        metadata_json: { created_count: 4, task_ids: ["task-1", "task-2"], href: "/projects/project-1/tasks" },
      }],
    }, "project-1");

    expect(bundle.outputs[0]).toMatchObject({
      title: "缺口补救任务", type: "task", kind: "task", count: 4, severity: "medium", href: "/projects/project-1/tasks", artifactType: "remediation_tasks",
      metrics: { remediationTaskCount: 4 },
    });
    expect(bundle.outputs[0].summary).toContain("本次运行创建 4 项整改任务");
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

  it("routes the final work-package review approval to the project review page", () => {
    const bundle = agentRunBundleFromApiPayload({
      ...persistedRun,
      approvals: [{ id: "approval-final-review", step_run_id: "step-1", approval_type: "final_work_package_review", status: "pending" }],
    }, "project-1");

    expect(bundle.approvals[0]).toMatchObject({ type: "final_work_package_review", destinationLabel: "打开最终工作包复核", href: "/projects/project-1/review" });
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
