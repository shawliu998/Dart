import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { AgentStatusControl } from "@/components/agent";
import { createAgentRunBundle, type AgentDataResult, type AgentRunBundle } from "@/lib/agent";

describe("AgentWorkspace", () => {
  it("shows the deterministic run, textual step states, real approval routes and source evidence", () => {
    const result: AgentDataResult<AgentRunBundle> = { source: "demo", data: createAgentRunBundle("project-1"), error: null };
    render(<AgentWorkspace initialResult={result} projectId="project-1" />);
    expect(screen.getByRole("heading", { name: "投标合规与交付编排" })).toBeInTheDocument();
    expect(screen.getByText("本地确定性演示")).toBeInTheDocument();
    expect(screen.getAllByText("等待人工批准").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已阻塞").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /打开要求复核工作台/ })).toHaveAttribute("href", "/projects/project-1/requirements");
    expect(screen.getByRole("link", { name: /打开证据匹配工作台/ })).toHaveAttribute("href", "/projects/project-1/evidence-matching");
    expect(screen.getAllByText("第 21 页").length).toBeGreaterThan(0);
    expect(screen.getByText(/不执行法律资格裁决/)).toBeInTheDocument();
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

  it("makes demo fallback an explicit user choice after API failure", async () => {
    const user = userEvent.setup();
    const result: AgentDataResult<AgentRunBundle> = { source: "failure", data: null, error: { code: "agent_aggregation_failed", message: "Agent 运行聚合失败：API_503。未自动切换为演示数据。", retryable: true } };
    render(<AgentWorkspace initialResult={result} projectId="project-2" />);
    expect(screen.getByRole("alert")).toHaveTextContent("没有自动切换到演示结果");
    expect(screen.queryByText("本地确定性演示")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /显式打开本地演示/ }));
    expect(screen.getByText("本地确定性演示")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /打开要求复核工作台/ })).toHaveAttribute("href", "/projects/project-2/requirements");
  });
});
