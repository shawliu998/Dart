import { render, screen } from "@testing-library/react";
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
import { consistencyIssues, packageChecks, packageTree } from "@/lib/phase-data/demo";

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
    render(<ConsistencyWorkbench projectId="p-1" initialIssues={consistencyIssues.slice(0, 1)} source="demo" />);
    await user.click(screen.getByRole("button", { name: /采用标准值/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("请先填写处理原因");
    await user.type(screen.getByPlaceholderText(/说明采用该值/), "已由商务负责人复核报价表原件");
    await user.click(screen.getByRole("button", { name: /采用标准值/ }));
    expect(screen.getByText("已解决")).toBeInTheDocument();
    resolveConsistency.mockRestore();
  });

  it("blocks final package generation while failed checks remain", async () => {
    const user = userEvent.setup();
    render(<PackageCenter projectId="p-1" initialTree={packageTree} initialChecks={packageChecks} source="demo" />);
    await user.click(screen.getByRole("button", { name: "生成最终 ZIP" }));
    expect(screen.getByText(/仍有 2 个阻塞问题/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /批准并生成 ZIP/ })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: /已经解决/ })).toBeInTheDocument();
  });

  it("shows an explicit API failure state without demo records", () => {
    const { rerender } = render(
      <ConsistencyWorkbench projectId="p-1" initialIssues={[]} source="api" loadError="网关不可达" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("一致性检查 API 数据不可用");
    expect(screen.getByRole("alert")).toHaveTextContent("当前未显示任何演示记录");

    rerender(<AmendmentWorkbench projectId="p-1" initialAmendments={[]} source="api" loadError="网关不可达" />);
    expect(screen.getByRole("alert")).toHaveTextContent("补充公告 API 数据不可用");

    rerender(<TaskCenter projectId="p-1" initialTasks={[]} source="api" loadError="网关不可达" />);
    expect(screen.getByRole("alert")).toHaveTextContent("整改任务 API 数据不可用");

    rerender(<PackageCenter projectId="p-1" initialTree={[]} initialChecks={[]} source="api" loadError="网关不可达" />);
    expect(screen.getByRole("alert")).toHaveTextContent("文件封装 API 数据不可用");

    rerender(<AuditCenter projectId="p-1" initialRecords={[]} source="api" loadError="网关不可达" />);
    expect(screen.getByRole("alert")).toHaveTextContent("审计记录 API 数据不可用");
  });
});
