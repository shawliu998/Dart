import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { AgentStatusControl } from "@/components/agent";
import { createAgentRunBundle, type AgentDataResult, type AgentRunBundle } from "@/lib/agent";
import { agentApi } from "@/lib/api/agent";

describe("AgentWorkspace", () => {
  it("shows the deterministic run, textual step states, real approval routes and source evidence", () => {
    const result: AgentDataResult<AgentRunBundle> = { source: "demo", data: createAgentRunBundle("project-1"), error: null };
    render(<AgentWorkspace initialResult={result} />);
    expect(screen.getByRole("heading", { name: "投标合规与交付编排" })).toBeInTheDocument();
    expect(screen.getByText("本地确定性演示")).toBeInTheDocument();
    expect(screen.getAllByText("补充文件更新后启动").length).toBeGreaterThan(0);
    expect(screen.getAllByText("等待人工批准").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已阻塞").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /打开要求复核工作台/ })).toHaveAttribute("href", "/projects/project-1/requirements");
    expect(screen.getByRole("link", { name: /打开证据匹配工作台/ })).toHaveAttribute("href", "/projects/project-1/evidence-matching");
    expect(screen.getAllByText("第 21 页").length).toBeGreaterThan(0);
    expect(screen.getByText(/不执行法律资格裁决/)).toBeInTheDocument();
  });

  it("shows the five-phase autonomous command center from API run fields", () => {
    const bundle = createAgentRunBundle("project-autonomous");
    bundle.run = { ...bundle.run, mode: "autonomous_draft", iteration: 4, maxIterations: 12, currentAction: "生成投标响应草稿", nextAction: "检查证据覆盖", observation: "发现 3 项待补充材料", planStages: [{ key: "understand", title: "服务端计划：文件理解", status: "completed" }, { key: "evidence", title: "服务端计划：证据处理", status: "waiting_approval" }] };
    render(<AgentWorkspace initialResult={{ source: "api", data: bundle, error: null }} />);
    expect(screen.getByRole("heading", { name: "自主执行计划" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "五阶段执行计划" })).toBeInTheDocument();
    expect(screen.getByText("生成投标响应草稿")).toBeInTheDocument();
    expect(screen.getByText("检查证据覆盖")).toBeInTheDocument();
    expect(screen.getByText("发现 3 项待补充材料")).toBeInTheDocument();
    expect(screen.getByText("第 4 / 12 次迭代")).toBeInTheDocument();
    expect(screen.getByText(/当前产物均为内部草稿/)).toBeInTheDocument();
    expect(screen.getByText("服务端计划：文件理解")).toBeInTheDocument();
    expect(screen.getByText("服务端计划：证据处理")).toBeInTheDocument();
    expect(screen.queryByText("交付物生成")).not.toBeInTheDocument();
  });

  it("shows a business outcome separately from the technical run status", () => {
    const bundle = createAgentRunBundle("project-outcome");
    bundle.run = { ...bundle.run, mode: "autonomous_draft", status: "completed", outcome: "partial" };
    render(<AgentWorkspace initialResult={{ source: "api", data: bundle, error: null }} />);
    expect(screen.getAllByText("已完成").length).toBeGreaterThan(0);
    expect(screen.getByText("已生成部分结果")).toBeInTheDocument();
  });

  it("shows an explicit fallback instead of crashing when source arrays are empty", () => {
    const bundle = createAgentRunBundle("project-no-source");
    bundle.steps[0] = { ...bundle.steps[0], sources: [] };
    bundle.approvals[0] = { ...bundle.approvals[0], sourceReferences: [] };
    bundle.outputs[0] = { ...bundle.outputs[0], provenance: [] };
    render(<AgentWorkspace initialResult={{ source: "api", data: bundle, error: null }} />);
    expect(screen.getAllByText("当前输出暂未绑定可展示来源").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps run polling available and shows the real event error when event refresh fails", async () => {
    const bundle = createAgentRunBundle("project-events");
    bundle.run = { ...bundle.run, mode: "autonomous_draft", status: "running", planStages: [{ key: "understand", title: "理解文件", status: "in_progress" }] };
    const events = vi.spyOn(agentApi, "events").mockRejectedValue(new Error("EVENTS_503"));
    const getRun = vi.spyOn(agentApi, "getRunById").mockResolvedValue({ source: "api", data: bundle, error: null });
    render(<AgentWorkspace initialResult={{ source: "api", data: bundle, error: null }} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("事件流刷新失败：EVENTS_503"));
    expect(getRun).toHaveBeenCalledWith(bundle.run.id, bundle.run.projectId);
    events.mockRestore();
    getRun.mockRestore();
  });

  it("shows a real run refresh failure while retaining the last successful snapshot", async () => {
    const bundle = createAgentRunBundle("project-run-refresh");
    bundle.run = { ...bundle.run, mode: "autonomous_draft", status: "running", planStages: [{ key: "understand", title: "理解文件", status: "in_progress" }] };
    const events = vi.spyOn(agentApi, "events").mockResolvedValue([]);
    const getRun = vi.spyOn(agentApi, "getRunById").mockResolvedValue({ source: "failure", data: null, error: { code: "agent_run_request_failed", message: "RUN_503", retryable: true } });
    render(<AgentWorkspace initialResult={{ source: "api", data: bundle, error: null }} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("运行状态刷新失败：RUN_503"));
    expect(screen.getAllByText(bundle.run.title).length).toBeGreaterThan(0);
    events.mockRestore();
    getRun.mockRestore();
  });

  it("keeps polling across a transient failed state until an automatic retry is queued", async () => {
    const runningBundle = createAgentRunBundle("project-retry-bridge");
    runningBundle.run = { ...runningBundle.run, mode: "autonomous_draft", status: "running" };
    const failedBundle = {
      ...runningBundle,
      run: { ...runningBundle.run, status: "failed" as const, summary: "等待后台任务安排重试" },
    };
    const queuedBundle = {
      ...runningBundle,
      run: { ...runningBundle.run, status: "queued" as const, summary: "后台任务已重新排队" },
    };
    const events = vi.spyOn(agentApi, "events").mockResolvedValue([]);
    const getRun = vi.spyOn(agentApi, "getRunById")
      .mockResolvedValueOnce({ source: "api", data: failedBundle, error: null })
      .mockResolvedValueOnce({ source: "api", data: failedBundle, error: null })
      .mockResolvedValue({ source: "api", data: queuedBundle, error: null });

    render(<AgentWorkspace initialResult={{ source: "api", data: runningBundle, error: null }} />);

    await waitFor(() => expect(getRun).toHaveBeenCalledTimes(3), { timeout: 2500 });
    expect(screen.getByText("后台任务已重新排队")).toBeInTheDocument();
    events.mockRestore();
    getRun.mockRestore();
  });

  it("opens the reusable status drawer with plan, tool calls, approvals and findings", async () => {
    const user = userEvent.setup();
    const bundle = createAgentRunBundle("project-drawer");
    render(<AgentStatusControl bundle={bundle} source="demo" />);
    await user.click(screen.getByRole("button", { name: /打开 Agent 运行详情/ }));
    expect(screen.getByRole("dialog", { name: "Agent 运行详情" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "计划" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "工具调用" }));
    expect(screen.getByText("DocumentIngestionService")).toBeInTheDocument();
    expect(screen.getAllByText("输入").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: /待审批/ }));
    expect(screen.getByRole("link", { name: /打开要求复核工作台/ })).toHaveAttribute("href", "/projects/project-drawer/requirements");
    await user.click(screen.getByRole("tab", { name: "本次发现" }));
    expect(screen.getByText("要求与风险矩阵")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭 Agent 运行详情" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not expose a demo fallback after an API failure", () => {
    const result: AgentDataResult<AgentRunBundle> = { source: "failure", data: null, error: { code: "agent_run_request_failed", message: "Agent 运行请求失败：API_503。未自动切换为演示数据。", retryable: true } };
    render(<AgentWorkspace initialResult={result} />);
    expect(screen.getByRole("alert")).toHaveTextContent("没有自动切换到演示结果");
    expect(screen.queryByText("本地确定性演示")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新重试" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /打开要求复核工作台/ })).not.toBeInTheDocument();
  });

  it("submits an API-only pending approval with its audited reason", async () => {
    const user = userEvent.setup();
    const approve = vi.spyOn(agentApi, "approve").mockResolvedValue({ ok: true });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bundle = createAgentRunBundle("project-api");
    const result: AgentDataResult<AgentRunBundle> = { source: "api", data: bundle, error: null };
    render(<AgentWorkspace initialResult={result} />);

    expect(screen.getAllByLabelText("审批理由").length).toBeGreaterThan(0);
    await user.type(screen.getAllByLabelText("审批理由")[0], "已核验原文证据");
    await user.click(screen.getAllByRole("button", { name: "批准" })[0]);
    expect(approve).toHaveBeenCalledWith(bundle.approvals[0].id, { reason: "已核验原文证据" });
    approve.mockRestore();
    consoleError.mockRestore();
  });

  it("keeps action controls out of the deterministic demo source", () => {
    const result: AgentDataResult<AgentRunBundle> = { source: "demo", data: createAgentRunBundle("project-1"), error: null };
    render(<AgentWorkspace initialResult={result} />);
    expect(screen.queryByLabelText("审批理由")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批准" })).not.toBeInTheDocument();
  });

  it("routes the final work-package approval through the unified review page", () => {
    const bundle = createAgentRunBundle("project-final-review");
    bundle.approvals = [{
      ...bundle.approvals[0],
      type: "final_work_package_review",
      status: "pending",
      destinationLabel: "打开最终工作包复核",
      href: "/projects/project-final-review/review",
    }];
    render(<AgentWorkspace initialResult={{ source: "api", data: bundle, error: null }} />);
    expect(screen.queryByLabelText("审批理由")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批准" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /打开最终工作包复核/ })).toHaveAttribute("href", "/projects/project-final-review/review");
  });

  it("sends a rejection reason to the persisted approval endpoint", async () => {
    const user = userEvent.setup();
    const reject = vi.spyOn(agentApi, "reject").mockResolvedValue({ ok: true });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bundle = createAgentRunBundle("project-reject");
    render(<AgentWorkspace initialResult={{ source: "api", data: bundle, error: null }} />);

    await user.type(screen.getAllByLabelText("审批理由")[0], "来源页码不足，退回补充证据");
    await user.click(screen.getAllByRole("button", { name: "拒绝" })[0]);
    expect(reject).toHaveBeenCalledWith(bundle.approvals[0].id, { reason: "来源页码不足，退回补充证据" });
    reject.mockRestore();
    consoleError.mockRestore();
  });
});
