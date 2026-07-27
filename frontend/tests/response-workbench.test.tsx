import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { ResponseWorkbench } from "@/features/responses/response-workbench";
import { diffResponseText } from "@/features/responses/response-diff";
import { mapResponseDto, responseApi, type TenderResponse } from "@/lib/api/responses";

const response: TenderResponse = {
  id: "rsp-1", projectId: "p-1", requirementId: "req-1", status: "drafted", strategy: "引用已接受的项目经理证书", draftText: "我方已配置符合要求的项目经理。", editedText: null,
  missingInformation: [], riskNotes: ["请核验证书有效期"], confidence: .86, generationVersion: 1, revisionNumber: 1, version: 1, evidenceClaimIds: ["claim-1"],
  requirement: { code: "REQ-001", title: "项目经理资质", category: "qualification", normalizedText: "项目经理须具备有效资格证书。", mandatory: true, riskLevel: "high" },
  requirementSource: { documentId: "doc-1", filename: "招标文件.pdf", version: 1, page: 3, clause: "3.1", excerpt: "项目经理须具备有效资格证书。", bbox: null },
  evidenceSources: [{ claimId: "claim-1", assetId: "asset-1", assetName: "项目经理证书", documentId: "doc-2", filename: "项目经理证书.pdf", documentVersion: 1, claimType: "certificate", subject: "张工", predicate: "持有", value: "项目经理证书", validTo: null, page: 1, excerpt: "项目经理资格证书", confidence: .92, humanVerified: true }],
};

const responses: TenderResponse[] = [
  {
    id: "response-1", projectId: "project-1", requirementId: "REQ-001", status: "needs_review",
    strategy: "实施方案", draftText: "第一条响应", editedText: null, missingInformation: [], riskNotes: [],
    confidence: 0.82, generationVersion: 1, revisionNumber: 1, version: 1, evidenceClaimIds: ["claim-1"],
    requirement: { code: "REQ-001", title: "实施方案", category: "technical", normalizedText: "提交实施方案。", mandatory: true, riskLevel: "high" }, requirementSource: null, evidenceSources: [],
  },
  {
    id: "response-2", projectId: "project-1", requirementId: "REQ-002", status: "missing_evidence",
    strategy: "人员资质", draftText: "第二条响应", editedText: null, missingInformation: ["项目经理证书"], riskNotes: [],
    confidence: 0.66, generationVersion: 1, revisionNumber: 1, version: 1, evidenceClaimIds: [],
    requirement: { code: "REQ-002", title: "人员资质", category: "personnel", normalizedText: "提供项目经理证书。", mandatory: true, riskLevel: "high" }, requirementSource: null, evidenceSources: [],
  },
];

describe("ResponseWorkbench", () => {
  it("saves an edited draft with an auditable reason", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(responseApi, "save").mockResolvedValue({ ...response, editedText: "人工复核后的响应内容", status: "needs_review", version: 2 });
    render(<ResponseWorkbench projectId="p-1" initialResponses={[response]} source="api" />);
    await user.clear(screen.getByLabelText("投标响应内容"));
    await user.type(screen.getByLabelText("投标响应内容"), "人工复核后的响应内容");
    await user.type(screen.getByPlaceholderText(/已核对营业执照/), "已核对项目经理证书原件");
    await user.click(screen.getByRole("button", { name: /保存并复核/ }));
    expect(save).toHaveBeenCalledWith("rsp-1", "人工复核后的响应内容", "已核对项目经理证书原件");
    expect(await screen.findByText("响应草稿已保存")).toBeInTheDocument();
    save.mockRestore();
  });

  it("does not approve a response without a review reason", async () => {
    const user = userEvent.setup();
    render(<ResponseWorkbench projectId="p-1" initialResponses={[response]} source="api" />);
    await user.click(screen.getByRole("button", { name: "批准响应" }));
    expect(screen.getByRole("alert")).toHaveTextContent("批准前请填写复核意见");
  });

  it("requires the edited response to be saved before approval", async () => {
    const user = userEvent.setup();
    render(<ResponseWorkbench projectId="p-1" initialResponses={[response]} source="api" />);
    await user.clear(screen.getByLabelText("投标响应内容"));
    await user.type(screen.getByLabelText("投标响应内容"), "尚未保存的人工修改");
    await user.type(screen.getByLabelText("修改／复核意见（必填）"), "已核对原件");
    expect(screen.getByRole("button", { name: "批准响应" })).toBeDisabled();
  });

  it("supports real answer and section disclosures for dense list scanning", async () => {
    const user = userEvent.setup();
    render(<ResponseWorkbench projectId="project-1" initialResponses={responses} source="api" />);
    const answer = screen.getByRole("button", { name: /REQ-001 实施方案/ });
    expect(answer).toHaveAttribute("aria-expanded", "true");
    await user.click(answer);
    expect(answer).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("投标响应内容")).not.toBeInTheDocument();
    await user.click(answer);
    expect(screen.getByLabelText("投标响应内容")).toBeInTheDocument();

    const section = screen.getByRole("heading", { name: "1.0 技术要求" }).closest("button");
    expect(section).not.toBeNull();
    await user.click(section!);
    expect(section).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /REQ-001 实施方案/ })).not.toBeInTheDocument();
  });

  it("moves a human-completed missing-evidence draft into the existing review contract", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(responseApi, "save").mockResolvedValue({ ...responses[1], editedText: "人工补充后的人员资质响应", status: "needs_review", version: 2 });
    render(<ResponseWorkbench projectId="project-1" initialResponses={[responses[1]]} source="api" />);
    expect(screen.getByRole("button", { name: "批准响应" })).toBeDisabled();
    await user.clear(screen.getByLabelText("投标响应内容"));
    await user.type(screen.getByLabelText("投标响应内容"), "人工补充后的人员资质响应");
    await user.type(screen.getByPlaceholderText(/已核对营业执照/), "已人工补充并复核响应正文");
    await user.click(screen.getByRole("button", { name: /保存并复核/ }));
    expect(await screen.findByText("响应草稿已保存")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批准响应" })).toBeEnabled();
    save.mockRestore();
  });

  it("shows the existing requirement and accepted evidence projection without inventing sources", async () => {
    const user = userEvent.setup();
    render(<ResponseWorkbench projectId="p-1" initialResponses={[response]} source="api" />);
    expect(screen.getByRole("heading", { name: "要求与依据" })).toBeInTheDocument();
    expect(screen.getByText("招标文件.pdf")).toBeInTheDocument();
    expect(screen.getByText("项目经理证书")).toBeInTheDocument();
    expect(screen.getByText("仅展示已接受的来源证据")).toBeInTheDocument();
    const sourcesPanel = screen.getByRole("button", { name: "依据" });
    expect(sourcesPanel).toHaveAttribute("aria-pressed", "false");
    await user.click(sourcesPanel);
    expect(sourcesPanel).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps a failed API read distinct from an empty response list", () => {
    render(<ResponseWorkbench projectId="p-1" initialResponses={[]} source="api" loadError="API_503" />);
    expect(screen.getByRole("alert")).toHaveTextContent("投标响应 API 数据不可用");
    expect(screen.getByRole("alert")).toHaveTextContent("当前未显示任何演示记录");
  });

  it("keeps the selected canvas within the current status filter without losing drafts", async () => {
    const user = userEvent.setup();
    render(<ResponseWorkbench projectId="project-1" initialResponses={responses} source="api" />);
    await user.clear(screen.getByLabelText("投标响应内容"));
    await user.type(screen.getByLabelText("投标响应内容"), "第一条未保存的正文");
    await user.selectOptions(screen.getByLabelText("响应状态筛选"), "missing_evidence");
    expect(screen.getByRole("heading", { name: "人员资质" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("第二条响应")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("响应状态筛选"), "all");
    await user.click(screen.getByRole("button", { name: /实施方案/ }));
    expect(screen.getByDisplayValue("第一条未保存的正文")).toBeInTheDocument();
  });

  it("clears query and status filters atomically without leaving a hidden editable item", async () => {
    const user = userEvent.setup();
    render(<ResponseWorkbench projectId="project-1" initialResponses={responses} source="api" />);
    await user.selectOptions(screen.getByLabelText("响应状态筛选"), "missing_evidence");
    await user.type(screen.getByLabelText("检索响应条目"), "不存在的要求");
    expect(screen.queryByLabelText("投标响应内容")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getByLabelText("检索响应条目")).toHaveValue("");
    expect(screen.getByLabelText("响应状态筛选")).toHaveValue("all");
    expect(screen.getByLabelText("投标响应内容")).toBeInTheDocument();
  });

  it("moves through responses with keyboard shortcuts and exits with Escape", async () => {
    const user = userEvent.setup();
    render(<ResponseWorkbench projectId="project-1" initialResponses={responses} source="demo" />);

    expect(screen.getByRole("heading", { name: "实施方案" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "复核模式" }));
    expect(screen.getByRole("status")).toHaveTextContent("键盘复核已开启");

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("heading", { name: "人员资质" })).toBeInTheDocument();
    await user.keyboard("k");
    expect(screen.getByRole("heading", { name: "实施方案" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("投标响应内容"));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("heading", { name: "实施方案" })).toBeInTheDocument();

    await user.click(document.body);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "复核模式" })).toHaveAttribute("aria-pressed", "false");
  });

  it("rejects malformed nullable source values instead of manufacturing a page or confidence", () => {
    const mapped = mapResponseDto({ id: "rsp", project_id: "p", requirement_id: "r", status: "drafted", evidence_sources: [{ claim_id: "claim", asset_id: "asset", document_id: "doc", filename: "材料.pdf", claim_type: "certificate", subject: "主体", predicate: "拥有", value: "证书", page: null, confidence: null }], requirement_source: { document_id: "tender", filename: "招标文件.pdf", version: 1, page: null, bbox: null } });
    expect(mapped.requirementSource).toBeNull();
    expect(mapped.evidenceSources).toEqual([]);
  });

  it("loads version history only when opened and defaults to latest versus previous", async () => {
    const user = userEvent.setup();
    const summaries = [
      { id: "rev-3", responseItemId: "rsp-1", revisionNumber: 3, eventType: "edited" as const, status: "needs_review" as const, generationVersion: 1, createdBy: "user-1", createdByName: "刘畅", createdAt: "2026-07-27T10:30:00Z" },
      { id: "rev-2", responseItemId: "rsp-1", revisionNumber: 2, eventType: "edited" as const, status: "needs_review" as const, generationVersion: 1, createdBy: "user-1", createdByName: "刘畅", createdAt: "2026-07-27T10:20:00Z" },
      { id: "rev-1", responseItemId: "rsp-1", revisionNumber: 1, eventType: "generated" as const, status: "drafted" as const, generationVersion: 1, createdBy: "user-1", createdByName: "刘畅", createdAt: "2026-07-27T10:10:00Z" },
    ];
    const listRevisions = vi.spyOn(responseApi, "listRevisions").mockResolvedValue(summaries);
    const getRevision = vi.spyOn(responseApi, "getRevision").mockImplementation(async (_id, revisionNumber) => ({
      ...summaries.find((revision) => revision.revisionNumber === revisionNumber)!,
      draftText: "原始响应内容",
      editedText: revisionNumber === 3 ? "调整后的响应内容" : revisionNumber === 2 ? "上一版响应内容" : null,
    }));

    render(<ResponseWorkbench projectId="p-1" initialResponses={[{ ...response, revisionNumber: 3 }]} source="api" />);
    expect(listRevisions).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "版本历史" }));
    expect(await screen.findByLabelText("响应版本历史")).toBeInTheDocument();
    expect(listRevisions).toHaveBeenCalledWith("rsp-1");
    expect(await screen.findByText("调整后的响应内容")).toBeInTheDocument();
    expect(screen.getByLabelText("对比起始版本")).toHaveValue("2");
    expect(screen.getByLabelText("对比目标版本")).toHaveValue("3");
    expect(getRevision).toHaveBeenCalledWith("rsp-1", 2);
    expect(getRevision).toHaveBeenCalledWith("rsp-1", 3);

    await user.selectOptions(screen.getByLabelText("对比起始版本"), "1");
    expect(await screen.findByText("原始响应内容")).toBeInTheDocument();
    expect(getRevision).toHaveBeenCalledWith("rsp-1", 1);
    listRevisions.mockRestore();
    getRevision.mockRestore();
  });

  it("shows a truthful single-version state instead of a fake comparison", async () => {
    const user = userEvent.setup();
    const listRevisions = vi.spyOn(responseApi, "listRevisions").mockResolvedValue([
      { id: "rev-1", responseItemId: "rsp-1", revisionNumber: 1, eventType: "generated", status: "drafted", generationVersion: 1, createdBy: "user-1", createdByName: "刘畅", createdAt: "2026-07-27T10:10:00Z" },
    ]);
    const getRevision = vi.spyOn(responseApi, "getRevision");
    render(<ResponseWorkbench projectId="p-1" initialResponses={[response]} source="api" />);
    await user.click(screen.getByRole("button", { name: "版本历史" }));
    expect(await screen.findByText("目前只有一个版本")).toBeInTheDocument();
    expect(screen.queryByLabelText("对比起始版本")).not.toBeInTheDocument();
    expect(getRevision).not.toHaveBeenCalled();
    listRevisions.mockRestore();
    getRevision.mockRestore();
  });

  it("explains an approval-only revision without implying a text change", async () => {
    const user = userEvent.setup();
    const summaries = [
      { id: "rev-4", responseItemId: "rsp-1", revisionNumber: 4, eventType: "approved" as const, status: "approved" as const, generationVersion: 1, createdBy: "user-1", createdByName: "刘畅", createdAt: "2026-07-27T10:40:00Z" },
      { id: "rev-3", responseItemId: "rsp-1", revisionNumber: 3, eventType: "edited" as const, status: "needs_review" as const, generationVersion: 1, createdBy: "user-1", createdByName: "刘畅", createdAt: "2026-07-27T10:30:00Z" },
    ];
    const listRevisions = vi.spyOn(responseApi, "listRevisions").mockResolvedValue(summaries);
    const getRevision = vi.spyOn(responseApi, "getRevision").mockImplementation(async (_id, revisionNumber) => ({
      ...summaries.find((revision) => revision.revisionNumber === revisionNumber)!,
      draftText: "原始响应内容",
      editedText: "批准时未修改的响应内容",
    }));

    render(<ResponseWorkbench projectId="p-1" initialResponses={[{ ...response, revisionNumber: 4 }]} source="api" />);
    await user.click(screen.getByRole("button", { name: "版本历史" }));
    expect(await screen.findByText("响应内容未变化")).toBeInTheDocument();
    expect(screen.getByText("v4 · 仅记录人工批准事件")).toBeInTheDocument();

    listRevisions.mockRestore();
    getRevision.mockRestore();
  });

  it("builds deterministic changed, removed and added response blocks", () => {
    expect(diffResponseText("保留段落\n删除段落\n共同结尾", "保留段落\n共同结尾\n新增段落")).toEqual([
      { before: "保留段落", after: "保留段落", kind: "same" },
      { before: "删除段落", after: null, kind: "removed" },
      { before: "共同结尾", after: "共同结尾", kind: "same" },
      { before: null, after: "新增段落", kind: "added" },
    ]);
  });
});
