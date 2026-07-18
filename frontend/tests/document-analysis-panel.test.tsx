import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { DocumentAnalysisPanel } from "@/features/projects/document-analysis-panel";
import { agentApi } from "@/lib/api/agent";
import { projectApi, type ProjectDocument } from "@/lib/api/projects";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const document: ProjectDocument = { id: "doc-1", projectId: "project-1", filename: "招标文件.pdf", documentType: "tender_main", mimeType: "application/pdf", size: 100, parseRevision: 1, parseStatus: "completed", pageCount: 12, createdAt: "2026-07-18" };

describe("DocumentAnalysisPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the published version and refreshes after a completed reanalysis", async () => {
    vi.spyOn(projectApi, "reanalyzeDocument").mockResolvedValue({ job_id: "job-1", status: "completed" });
    vi.spyOn(projectApi, "documents").mockResolvedValue([{ ...document, parseRevision: 2 }]);
    vi.spyOn(agentApi, "createRun").mockResolvedValue({ source: "api", data: {} as never, error: null });
    render(<DocumentAnalysisPanel projectId="project-1" initialDocuments={[document]} />);

    expect(screen.getByText(/分析版本 V1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新分析" }));

    await waitFor(() => expect(screen.getByText(/分析版本 V2/)).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("增量 Agent 已启动");
    expect(agentApi.createRun).toHaveBeenCalledWith("project-1", expect.objectContaining({ scope: "amendment_reanalysis" }));
  });

  it("explains an active analysis conflict", async () => {
    vi.spyOn(projectApi, "reanalyzeDocument").mockRejectedValue(new Error("API_409"));
    render(<DocumentAnalysisPanel projectId="project-1" initialDocuments={[document]} />);
    fireEvent.click(screen.getByRole("button", { name: "重新分析" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("已有分析任务正在运行");
  });
});
