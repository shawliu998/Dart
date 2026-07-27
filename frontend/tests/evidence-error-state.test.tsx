import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvidenceLibrary } from "@/features/evidence/evidence-library";
import { EvidenceMatchingWorkbench } from "@/features/evidence/evidence-matching-workbench";
import { evidenceAssets } from "@/lib/phase-data/demo";

describe("evidence API error states", () => {
  it("shows an explicit unavailable state instead of material data", () => {
    render(
      <EvidenceLibrary
        initialAssets={[]}
        source="api"
        error="API_503"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("企业材料数据暂时不可用");
    expect(screen.getByText("API 数据不可用")).toBeInTheDocument();
    expect(screen.queryByText("材料清单")).not.toBeInTheDocument();
  });

  it("shows an explicit unavailable state instead of matching candidates", () => {
    render(
      <EvidenceMatchingWorkbench
        projectId="project-1"
        initialGroups={[]}
        source="api"
        error="API_503"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("证据匹配数据暂时不可用");
    expect(screen.getByText("API 数据不可用")).toBeInTheDocument();
    expect(screen.queryByText("招标要求")).not.toBeInTheDocument();
  });

  it("filters the existing material data and switches the review detail", async () => {
    const user = userEvent.setup();
    render(
      <EvidenceLibrary
        initialAssets={evidenceAssets}
        source="demo"
      />,
    );

    expect(screen.queryByText("30 天内到期")).not.toBeInTheDocument();
    expect(screen.queryByText("上传材料")).not.toBeInTheDocument();
    expect(screen.getByLabelText("材料复用提示")).toHaveTextContent(
      "信息已验证，可作为候选材料",
    );

    await user.click(screen.getByRole("button", { name: /ISO27001证书.pdf/ }));
    expect(screen.getByLabelText("材料复用提示")).toHaveTextContent(
      "已过期，不应直接复用",
    );

    await user.selectOptions(screen.getByLabelText("材料状态筛选"), "conflict");
    expect(screen.getByRole("button", { name: /项目经理证书及履历.pdf/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ISO27001证书.pdf/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("材料复用提示")).toHaveTextContent(
      "存在冲突，需要先复核",
    );
  });

  it("keeps claims, source, usage and current version tied to the selected material", async () => {
    const user = userEvent.setup();
    render(
      <EvidenceLibrary
        initialAssets={evidenceAssets}
        source="demo"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "使用项目" }));
    expect(screen.getByText("智慧园区综合管理平台采购项目")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "版本" }));
    expect(screen.getByText("现有接口只返回最新版本")).toBeInTheDocument();
    expect(screen.getAllByText(/V3/).length).toBeGreaterThan(0);
    expect(screen.queryByText("初始上传")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Claims/ }));
    await user.click(screen.getAllByRole("button", { name: /第 1 页/ })[0]);
    expect(screen.getByRole("tab", { name: "来源预览" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("营业执照.pdf 文档预览")).toBeInTheDocument();
  });
});
