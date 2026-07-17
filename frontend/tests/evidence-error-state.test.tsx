import { render, screen } from "@testing-library/react";
import { EvidenceLibrary } from "@/features/evidence/evidence-library";
import { EvidenceMatchingWorkbench } from "@/features/evidence/evidence-matching-workbench";

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
});
