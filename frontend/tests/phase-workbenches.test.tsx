import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ConsistencyWorkbench } from "@/features/consistency/consistency-workbench";
import { PackageCenter } from "@/features/package/package-center";
import { AmendmentWorkbench } from "@/features/amendments/amendment-workbench";
import { TaskCenter } from "@/features/tasks/task-center";
import { AuditCenter } from "@/features/audit/audit-center";
import { DisqualificationCenter } from "@/features/disqualifications/disqualification-center";
import { phaseApi } from "@/lib/api/phase2";
import { disqualifications } from "@/lib/demo/data";
import {
  consistencyIssues,
  packageChecks,
  packageTree,
  remediationTasks,
} from "@/lib/phase-data/demo";

describe("Phase 3-5 workbenches", () => {
  it("requires a reason before adopting a consistency standard", async () => {
    const user = userEvent.setup();
    const resolveConsistency = vi
      .spyOn(phaseApi, "resolveConsistency")
      .mockResolvedValue({
        data: { id: "ISSUE-001", status: "resolved" },
        persisted: false,
        message: "测试中的本地确定性结果。",
      });
    render(
      <ConsistencyWorkbench
        projectId="p-1"
        initialIssues={consistencyIssues.slice(0, 1)}
        source="demo"
      />,
    );
    await user.click(screen.getByRole("button", { name: /采用标准值/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("请先填写处理原因");
    await user.type(
      screen.getByPlaceholderText(/说明采用该值/),
      "已由商务负责人复核报价表原件",
    );
    await user.click(screen.getByRole("button", { name: /采用标准值/ }));
    expect(screen.getByText("已解决")).toBeInTheDocument();
    resolveConsistency.mockRestore();
  });

  it("blocks final package generation while failed checks remain", async () => {
    const user = userEvent.setup();
    render(
      <PackageCenter
        projectId="p-1"
        initialTree={packageTree}
        initialChecks={packageChecks}
        source="demo"
      />,
    );
    await user.click(screen.getByRole("button", { name: "生成最终 ZIP" }));
    expect(screen.getByText(/仍有 2 个阻塞问题/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /批准并生成 ZIP/ }),
    ).toBeDisabled();
  });

  it("keeps package review filtering and mobile panes in one workflow", async () => {
    const user = userEvent.setup();
    render(
      <PackageCenter
        projectId="p-1"
        initialTree={packageTree}
        initialChecks={packageChecks}
        source="demo"
      />,
    );

    await user.click(screen.getByRole("button", { name: /待处理 4/ }));
    expect(
      screen.getByRole("button", { name: /必要文件存在/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /PDF 可打开/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /已通过 3/ }));
    expect(
      screen.getByRole("button", { name: /PDF 可打开/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /必要文件存在/ }),
    ).not.toBeInTheDocument();

    const filesPane = screen.getByRole("button", { name: /交付文件 7/ });
    await user.click(filesPane);
    expect(filesPane).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /检查与处理 4/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps task filtering, selection and source context in one worklist", async () => {
    const user = userEvent.setup();
    render(
      <TaskCenter
        projectId="p-1"
        initialTasks={remediationTasks}
        source="demo"
      />,
    );

    expect(screen.queryByText("3 天内到期")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("按优先级筛选"), "high");
    expect(
      screen.getByRole("button", {
        name: /修正投标函法律主体名称/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /统一四份文件中的投标总报价/,
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /应用补充公告的 8,000 条\/秒参数/,
      }),
    );
    expect(
      screen.getByRole("heading", {
        name: "应用补充公告的 8,000 条/秒参数",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /补充公告01 · 6.3.4/ }),
    ).toHaveAttribute("href", expect.stringContaining("/amendments"));
    expect(screen.getByRole("button", { name: "任务详情" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("advances a remediation task through the existing ordered actions", async () => {
    const user = userEvent.setup();
    const updateTask = vi.spyOn(phaseApi, "updateTask").mockResolvedValue({
      data: { id: "TASK-003", status: "in_progress" },
      persisted: true,
      message: "已开始处理",
    });
    const completeTask = vi.spyOn(phaseApi, "completeTask").mockResolvedValue({
      data: { id: "TASK-003", status: "review" },
      persisted: true,
      message: "已提交复核",
    });
    const reviewTask = vi.spyOn(phaseApi, "reviewTask").mockResolvedValue({
      data: { id: "TASK-003", status: "done" },
      persisted: true,
      message: "复核完成",
    });

    render(
      <TaskCenter
        projectId="p-1"
        initialTasks={[remediationTasks[2]]}
        source="api"
      />,
    );

    await user.click(screen.getByRole("button", { name: "开始处理" }));
    expect(updateTask).toHaveBeenCalledWith(
      "TASK-003",
      { status: "in_progress" },
      "任务流转：todo → in_progress",
    );
    await user.click(screen.getByRole("button", { name: "提交复核" }));
    expect(completeTask).toHaveBeenCalledWith("TASK-003");
    await user.click(screen.getByRole("button", { name: "复核并完成" }));
    expect(reviewTask).toHaveBeenCalledWith("TASK-003");
    expect(
      screen.getByRole("button", { name: "重新打开" }),
    ).toBeInTheDocument();

    updateTask.mockRestore();
    completeTask.mockRestore();
    reviewTask.mockRestore();
  });

  it("blocks a task dragged across the ordered review states", async () => {
    const user = userEvent.setup();
    render(
      <TaskCenter
        projectId="p-1"
        initialTasks={[remediationTasks[2], remediationTasks[6]]}
        source="demo"
      />,
    );

    await user.click(screen.getByRole("button", { name: "流程视图" }));
    fireEvent.dragStart(
      screen.getByRole("button", {
        name: /修正投标函法律主体名称/,
      }),
    );
    fireEvent.drop(screen.getByLabelText("已完成列"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "当前不能从 待处理 直接进入 已完成",
    );
  });

  it("requires an audited reason before recording a disqualification decision", async () => {
    const user = userEvent.setup();
    render(
      <DisqualificationCenter
        projectId="p-1"
        initialItems={disqualifications.slice(0, 1)}
        source="demo"
      />,
    );

    await user.click(screen.getByRole("button", { name: "标记已解决" }));
    const confirm = screen.getByRole("button", { name: "确认并记录" });
    expect(confirm).toBeDisabled();

    await user.type(
      screen.getByRole("textbox", { name: "决定理由" }),
      "已核对整改材料及招标文件原文",
    );
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(
      screen.getByRole("button", { name: /已经解决/ }),
    ).toBeInTheDocument();
  });

  it("shows an explicit API failure state without demo records", () => {
    const { rerender } = render(
      <ConsistencyWorkbench
        projectId="p-1"
        initialIssues={[]}
        source="api"
        loadError="网关不可达"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "一致性检查 API 数据不可用",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "当前未显示任何演示记录",
    );

    rerender(
      <AmendmentWorkbench
        projectId="p-1"
        initialAmendments={[]}
        source="api"
        loadError="网关不可达"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "补充公告 API 数据不可用",
    );

    rerender(
      <TaskCenter
        projectId="p-1"
        initialTasks={[]}
        source="api"
        loadError="网关不可达"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "整改任务 API 数据不可用",
    );

    rerender(
      <PackageCenter
        projectId="p-1"
        initialTree={[]}
        initialChecks={[]}
        source="api"
        loadError="网关不可达"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "文件封装 API 数据不可用",
    );

    rerender(
      <AuditCenter
        projectId="p-1"
        initialRecords={[]}
        source="api"
        loadError="网关不可达"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "审计记录 API 数据不可用",
    );
  });
});
