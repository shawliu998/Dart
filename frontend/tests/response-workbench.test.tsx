import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { ResponseWorkbench } from "@/features/responses/response-workbench";
import { responseApi, type TenderResponse } from "@/lib/api/responses";

const response: TenderResponse = {
  id: "rsp-1", projectId: "p-1", requirementId: "req-1", status: "drafted", strategy: "引用已接受的项目经理证书", draftText: "我方已配置符合要求的项目经理。", editedText: null,
  missingInformation: [], riskNotes: ["请核验证书有效期"], confidence: .86, generationVersion: 1, version: 1, evidenceClaimIds: ["claim-1"],
};

const responses: TenderResponse[] = [
  {
    id: "response-1", projectId: "project-1", requirementId: "REQ-001", status: "needs_review",
    strategy: "实施方案", draftText: "第一条响应", editedText: null, missingInformation: [], riskNotes: [],
    confidence: 0.82, generationVersion: 1, version: 1, evidenceClaimIds: ["claim-1"],
  },
  {
    id: "response-2", projectId: "project-1", requirementId: "REQ-002", status: "missing_evidence",
    strategy: "人员资质", draftText: "第二条响应", editedText: null, missingInformation: ["项目经理证书"], riskNotes: [],
    confidence: 0.66, generationVersion: 1, version: 1, evidenceClaimIds: [],
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

  it("keeps a failed API read distinct from an empty response list", () => {
    render(<ResponseWorkbench projectId="p-1" initialResponses={[]} source="api" loadError="API_503" />);
    expect(screen.getByRole("alert")).toHaveTextContent("投标响应 API 数据不可用");
    expect(screen.getByRole("alert")).toHaveTextContent("当前未显示任何演示记录");
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

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "复核模式" })).toHaveAttribute("aria-pressed", "false");
  });
});
