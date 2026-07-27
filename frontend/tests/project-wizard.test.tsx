import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("keeps successful files, retries one failure, and never recreates the project", async () => {
    const user = userEvent.setup();
    let resolveMainUpload!: (value: { id: string }) => void;
    let resolveRetry!: (value: { id: string }) => void;
    const mainUpload = new Promise<{ id: string }>((resolve) => { resolveMainUpload = resolve; });
    const retryUpload = new Promise<{ id: string }>((resolve) => { resolveRetry = resolve; });
    let attachmentAttempts = 0;
    const create = vi.spyOn(projectApi, "create").mockResolvedValue({ id: "project-1" } as never);
    vi.spyOn(projectApi, "uploadDocument").mockImplementation(async (_projectId, file) => {
      if (file.name === "招标文件.pdf") return mainUpload;
      attachmentAttempts += 1;
      if (attachmentAttempts === 1) throw new Error("附件上传超时");
      return retryUpload;
    });
    const createRun = vi.spyOn(agentApi, "createRun").mockResolvedValue({ source: "api", data: {} as never, error: null });
    render(<ProjectWizard />);

    await user.type(screen.getByRole("textbox", { name: /项目名称/ }), "续传测试项目");
    await user.upload(screen.getByLabelText("添加文件"), [
      new File(["main"], "招标文件.pdf", { type: "application/pdf" }),
      new File(["attachment"], "技术附件.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    ]);
    await user.click(screen.getByRole("button", { name: "创建并开始分析" }));

    const mainRow = screen.getByRole("row", { name: /招标文件.pdf/ });
    expect(within(mainRow).getByText("上传中")).toBeInTheDocument();
    resolveMainUpload({ id: "document-main" });

    expect(await screen.findByRole("alert")).toHaveTextContent("部分文件上传失败");
    expect(within(mainRow).getByText("已上传")).toBeInTheDocument();
    const attachmentRow = screen.getByRole("row", { name: /技术附件.xlsx/ });
    expect(within(attachmentRow).getByText("上传失败")).toBeInTheDocument();
    expect(within(attachmentRow).getByText("附件上传超时")).toBeInTheDocument();
    expect(createRun).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "重试 技术附件.xlsx" }));
    expect(within(attachmentRow).getByText("重试中")).toBeInTheDocument();
    resolveRetry({ id: "document-attachment" });
    await waitFor(() => expect(within(attachmentRow).getByText("已上传")).toBeInTheDocument());
    expect(create).toHaveBeenCalledTimes(1);
    expect(createRun).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "继续要求提取" }));
    await waitFor(() => expect(createRun).toHaveBeenCalledWith("project-1"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/projects/project-1/overview");
  });

  it("keeps batch retry limited to failed files before uploading later additions", async () => {
    const user = userEvent.setup();
    let failedAttempts = 0;
    const create = vi.spyOn(projectApi, "create").mockResolvedValue({ id: "project-1" } as never);
    const upload = vi.spyOn(projectApi, "uploadDocument").mockImplementation(async (_projectId, file) => {
      if (file.name === "失败附件.pdf") {
        failedAttempts += 1;
        if (failedAttempts === 1) throw new Error("附件上传失败");
      }
      return { id: `document-${file.name}` };
    });
    const createRun = vi.spyOn(agentApi, "createRun").mockResolvedValue({ source: "api", data: {} as never, error: null });
    render(<ProjectWizard />);

    await user.type(screen.getByRole("textbox", { name: /项目名称/ }), "批量重试语义测试");
    await user.upload(screen.getByLabelText("添加文件"), [
      new File(["main"], "招标文件.pdf", { type: "application/pdf" }),
      new File(["failed"], "失败附件.pdf", { type: "application/pdf" }),
    ]);
    await user.click(screen.getByRole("button", { name: "创建并开始分析" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("部分文件上传失败");

    await user.upload(
      screen.getByLabelText("添加文件"),
      new File(["later"], "后添加附件.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "重试失败文件" }));

    const failedRow = screen.getByRole("row", { name: /失败附件.pdf/ });
    const laterRow = screen.getByRole("row", { name: /后添加附件.pdf/ });
    await waitFor(() => expect(within(failedRow).getByText("已上传")).toBeInTheDocument());
    expect(within(laterRow).getByText("待上传")).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(3);
    expect(createRun).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "上传并继续" }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(4));
    expect(upload).toHaveBeenLastCalledWith("project-1", expect.objectContaining({ name: "后添加附件.pdf" }), "tender_attachment");
    expect(createRun).toHaveBeenCalledWith("project-1");
    expect(create).toHaveBeenCalledTimes(1);
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
