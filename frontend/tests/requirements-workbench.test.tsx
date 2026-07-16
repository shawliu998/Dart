import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequirementsWorkbench } from "@/features/requirements/requirements-workbench";
import { requirements } from "@/lib/demo/data";

describe("RequirementsWorkbench", () => {
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
});
