import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsistencyWorkbench } from "@/features/consistency/consistency-workbench";
import { PackageCenter } from "@/features/package/package-center";
import { consistencyIssues, packageChecks, packageTree } from "@/lib/phase-data/demo";

describe("Phase 3-5 workbenches", () => {
  it("requires a reason before adopting a consistency standard", async () => {
    const user = userEvent.setup();
    render(<ConsistencyWorkbench projectId="p-1" initialIssues={consistencyIssues.slice(0, 1)} source="demo" />);
    await user.click(screen.getByRole("button", { name: /采用标准值/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("请先填写处理原因");
    await user.type(screen.getByPlaceholderText(/说明采用该值/), "已由商务负责人复核报价表原件");
    await user.click(screen.getByRole("button", { name: /采用标准值/ }));
    expect(screen.getByText("已解决")).toBeInTheDocument();
  });

  it("blocks final package generation while failed checks remain", async () => {
    const user = userEvent.setup();
    render(<PackageCenter projectId="p-1" initialTree={packageTree} initialChecks={packageChecks} source="demo" />);
    await user.click(screen.getByRole("button", { name: "生成最终 ZIP" }));
    expect(screen.getByText(/仍有 2 个阻塞问题/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /批准并生成 ZIP/ })).toBeDisabled();
  });
});
