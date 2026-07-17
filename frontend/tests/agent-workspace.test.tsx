import { render, screen } from "@testing-library/react";
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
    bundle.run = { ...bundle.run, mode: "autonomous_draft", iteration: 4, maxIterations: 12, currentAction: "生成投标响应草稿", nextAction: "检查证据覆盖", observation: "发现 3 项待补充材料" };
    render(<AgentWorkspace initialResult={{ source: "api", data: bundle, error: null }} />);
    expect(screen.getByRole("heading", { name: "自主执行计划" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "五阶段执行计划" })).toBeInTheDocument();
    expect(screen.getByText("生成投标响应草稿")).toBeInTheDocument();
    expect(screen.getByText("检查证据覆盖")).toBeInTheDocument();
    expect(screen.getByText("发现 3 项待补充材料")).toBeInTheDocument();
    expect(screen.getByText("第 4 / 12 次迭代")).toBeInTheDocument();
    expect(screen.getByText(/当前产物均为内部草稿/)).toBeInTheDocument();
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
