import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AgentLaunchPanel } from "@/components/agent/agent-launch-panel";
import { agentApi } from "@/lib/api/agent";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("AgentLaunchPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    refresh.mockReset();
  });

  it("creates a run and refreshes the project page", async () => {
    const user = userEvent.setup();
    const createRun = vi.spyOn(agentApi, "createRun").mockResolvedValue({ source: "api", data: null, error: null } as never);
    render(<AgentLaunchPanel projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "发起项目分析" }));

    await waitFor(() => expect(createRun).toHaveBeenCalledWith("project-1", {
      goal: "完成投标文件分析、证据匹配与响应草稿，提交最终统一复核。",
      mode: "autonomous_draft",
      maxIterations: 20,
    }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends the selected autonomous objective and iteration limit", async () => {
    const user = userEvent.setup();
    const createRun = vi.spyOn(agentApi, "createRun").mockResolvedValue({ source: "api", data: null, error: null } as never);
    render(<AgentLaunchPanel projectId="project-1" />);

    await user.clear(screen.getByLabelText("目标"));
    await user.type(screen.getByLabelText("目标"), "优先完成资格材料草稿");
    await user.selectOptions(screen.getByLabelText("运行模式"), "supervised");
    await user.clear(screen.getByLabelText("最大迭代次数"));
    await user.type(screen.getByLabelText("最大迭代次数"), "8");
    await user.click(screen.getByRole("button", { name: "发起项目分析" }));

    await waitFor(() => expect(createRun).toHaveBeenCalledWith("project-1", { goal: "优先完成资格材料草稿", mode: "supervised", maxIterations: 8 }));
  });

  it("shows the API error without refreshing when creating a run fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(agentApi, "createRun").mockResolvedValue({
      source: "failure",
      data: null,
      error: { code: "agent_run_request_failed", message: "Agent 运行请求失败：API_503。未自动切换为演示数据。", retryable: true },
    });
    render(<AgentLaunchPanel projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "发起项目分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Agent 运行请求失败：API_503。未自动切换为演示数据。");
    expect(refresh).not.toHaveBeenCalled();
  });
});
