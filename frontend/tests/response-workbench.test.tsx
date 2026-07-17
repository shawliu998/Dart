import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ResponseWorkbench } from "@/features/responses/response-workbench";
import { responseApi, type TenderResponse } from "@/lib/api/responses";

const response: TenderResponse = {
  id: "rsp-1", projectId: "p-1", requirementId: "req-1", status: "drafted", strategy: "引用已接受的项目经理证书", draftText: "我方已配置符合要求的项目经理。", editedText: null,
  missingInformation: [], riskNotes: ["请核验证书有效期"], confidence: .86, generationVersion: 1, version: 1, evidenceClaimIds: ["claim-1"],
};

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
});
