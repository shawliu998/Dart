import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { ProjectWizard } from "@/features/projects/project-wizard";
import { agentApi } from "@/lib/api/agent";
import { projectApi } from "@/lib/api/projects";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("ProjectWizard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
  });

  it("creates a project, uploads files, then starts one agent run", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(projectApi, "create").mockResolvedValue({ id: "project-1" } as never);
    const upload = vi.spyOn(projectApi, "uploadDocument").mockResolvedValue({ id: "document-1" });
    const createRun = vi.spyOn(agentApi, "createRun").mockResolvedValue({ source: "api", data: {} as never, error: null });
    const parse = vi.spyOn(projectApi, "parseDocument");
    const extract = vi.spyOn(projectApi, "extractRequirements");
    const detect = vi.spyOn(projectApi, "detectDisqualifications");
    render(<ProjectWizard />);

    await user.type(screen.getByRole("textbox", { name: /项目名称/ }), "测试项目");
    await user.type(screen.getByRole("textbox", { name: /项目编号/ }), "TEST-001");
    await user.type(screen.getByRole("textbox", { name: /采购人/ }), "测试采购人");
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.upload(screen.getByLabelText("选择文件"), new File(["tender"], "招标文件.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "确认并开始分析" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "测试项目", projectCode: "TEST-001", buyerName: "测试采购人" }));
    expect(upload).toHaveBeenCalledWith("project-1", expect.any(File), "tender_main");
    expect(createRun).toHaveBeenCalledWith("project-1");
    expect(push).toHaveBeenCalledWith("/agent?project=project-1");
    expect(parse).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
  });

  it("keeps an API start failure visible instead of completing the wizard", async () => {
    const user = userEvent.setup();
    vi.spyOn(projectApi, "create").mockResolvedValue({ id: "project-1" } as never);
    vi.spyOn(projectApi, "uploadDocument").mockResolvedValue({ id: "document-1" });
    vi.spyOn(agentApi, "createRun").mockResolvedValue({ source: "failure", data: null, error: { code: "agent_run_request_failed", message: "Agent 启动失败", retryable: true } });
    render(<ProjectWizard />);

    await user.type(screen.getByRole("textbox", { name: /项目名称/ }), "测试项目");
    await user.type(screen.getByRole("textbox", { name: /项目编号/ }), "TEST-001");
    await user.type(screen.getByRole("textbox", { name: /采购人/ }), "测试采购人");
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.upload(screen.getByLabelText("选择文件"), new File(["tender"], "招标文件.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "确认并开始分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Agent 启动失败");
    expect(push).not.toHaveBeenCalled();
  });
});
