import { beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequirementsWorkbench } from "@/features/requirements/requirements-workbench";
import { requirements } from "@/lib/demo/data";

describe("RequirementsWorkbench", () => {
  beforeEach(() => localStorage.clear());

  it("keeps matrix selection, source page and details synchronized", async () => {
    const user = userEvent.setup();
    render(<RequirementsWorkbench initialRequirements={requirements.slice(0, 3)} />);
    await user.click(screen.getByText("ISO 27001 证书在有效期内"));
    expect(screen.getByText("第 21 页", { selector: ".document-footer strong" })).toBeInTheDocument();
    expect(screen.getAllByText(/投标人须具有有效期内的信息安全管理体系/)).toHaveLength(2);
  });

  it("filters to disqualification candidates", async () => {
    const user = userEvent.setup();
    render(<RequirementsWorkbench initialRequirements={requirements.slice(0, 8)} />);
    await user.selectOptions(screen.getByLabelText("筛选要求"), "disqualification");
    expect(screen.getAllByText(/否决风险/).length).toBeGreaterThan(0);
    expect(screen.queryByText("技术响应偏离表完整")).not.toBeInTheDocument();
  });

  it("switches between linked review, matrix and source views", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RequirementsWorkbench initialRequirements={requirements.slice(0, 8)} />,
    );
    await user.click(screen.getByRole("button", { name: "矩阵聚焦" }));
    expect(container.querySelector(".requirements-page")).toHaveClass(
      "requirements-view-matrix",
    );
    expect(screen.getByRole("button", { name: "矩阵聚焦" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "来源聚焦" }));
    expect(container.querySelector(".requirements-page")).toHaveClass(
      "requirements-view-source",
    );
  });

  it("restores a saved filter and workbench view", async () => {
    const user = userEvent.setup();
    const first = render(
      <RequirementsWorkbench initialRequirements={requirements.slice(0, 8)} />,
    );
    await user.selectOptions(
      screen.getByLabelText("筛选要求"),
      "disqualification",
    );
    await user.click(screen.getByRole("button", { name: "矩阵聚焦" }));
    await user.click(screen.getByRole("button", { name: "保存视图" }));
    expect(
      JSON.parse(
        localStorage.getItem("bidevidence.requirements.view") ?? "{}",
      ),
    ).toMatchObject({ filter: "disqualification", view: "matrix" });
    first.unmount();

    const restored = render(
      <RequirementsWorkbench initialRequirements={requirements.slice(0, 8)} />,
    );
    await waitFor(() =>
      expect(restored.container.querySelector(".requirements-page")).toHaveClass(
        "requirements-view-matrix",
      ),
    );
    expect(screen.getByLabelText("筛选要求")).toHaveValue("disqualification");
  });

  it("reveals real batch actions only after selecting requirements", async () => {
    const user = userEvent.setup();
    render(
      <RequirementsWorkbench initialRequirements={requirements.slice(0, 3)} />,
    );
    expect(screen.queryByText(/已选择 1 条要求/)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(`选择 ${requirements[0].code}`));
    expect(screen.getByText(/已选择 1 条要求/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除选择" }));
    expect(screen.queryByText(/已选择 1 条要求/)).not.toBeInTheDocument();
  });
});
