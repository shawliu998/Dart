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
    await user.upload(screen.getByLabelText("添加文件"), new File(["tender"], "招标文件.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "创建并开始分析" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "测试项目", projectCode: "TEST-001", buyerName: "测试采购人" }));
    expect(upload).toHaveBeenCalledWith("project-1", expect.any(File), "tender_main");
    expect(createRun).toHaveBeenCalledWith("project-1");
    expect(push).toHaveBeenCalledWith("/projects/project-1/overview");
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
    await user.upload(screen.getByLabelText("添加文件"), new File(["tender"], "招标文件.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "创建并开始分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Agent 启动失败");
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps document purpose explicit through upload", async () => {
    const user = userEvent.setup();
    const upload = vi.spyOn(projectApi, "uploadDocument").mockResolvedValue({ id: "document-1" });
    vi.spyOn(projectApi, "create").mockResolvedValue({ id: "project-1" } as never);
    vi.spyOn(agentApi, "createRun").mockResolvedValue({ source: "api", data: {} as never, error: null });
    render(<ProjectWizard />);

    await user.type(screen.getByRole("textbox", { name: /项目名称/ }), "分类测试项目");
    await user.upload(screen.getByLabelText("添加文件"), [
      new File(["main"], "招标文件.pdf", { type: "application/pdf" }),
      new File(["notice"], "补充公告.pdf", { type: "application/pdf" }),
    ]);

    expect(screen.getByLabelText("设置 招标文件.pdf 文档类型")).toHaveValue("tender_main");
    expect(screen.getByLabelText("设置 补充公告.pdf 文档类型")).toHaveValue("tender_attachment");
    await user.selectOptions(screen.getByLabelText("设置 补充公告.pdf 文档类型"), "amendment");
    await user.click(screen.getByRole("button", { name: "创建并开始分析" }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenCalledWith("project-1", expect.any(File), "tender_main");
    expect(upload).toHaveBeenCalledWith("project-1", expect.any(File), "amendment");
  });

  it("supports filtering and removing uploaded files without dead controls", async () => {
    const user = userEvent.setup();
    render(<ProjectWizard />);

    expect(screen.getByRole("button", { name: "创建并开始分析" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /项目名称/ }), "按钮测试项目");
    await user.upload(screen.getByLabelText("添加文件"), [
      new File(["main"], "招标文件.pdf", { type: "application/pdf" }),
      new File(["notice"], "补充公告.pdf", { type: "application/pdf" }),
    ]);

    expect(screen.getByRole("button", { name: "创建并开始分析" })).toBeEnabled();
    await user.selectOptions(screen.getByLabelText("设置 补充公告.pdf 文档类型"), "amendment");
    await user.selectOptions(screen.getByLabelText("按文档类型筛选"), "amendment");
    expect(screen.queryByText("招标文件.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("补充公告.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移除 补充公告.pdf" }));
    expect(screen.getByText("当前筛选条件下没有文件。")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("按文档类型筛选"), "all");
    expect(screen.getByText("招标文件.pdf")).toBeInTheDocument();
  });

  it("keeps both exit paths wired to the project list", () => {
    render(<ProjectWizard />);

    expect(screen.getByRole("link", { name: "返回项目" })).toHaveAttribute("href", "/projects");
    expect(screen.getByRole("link", { name: "取消" })).toHaveAttribute("href", "/projects");
  });
});
