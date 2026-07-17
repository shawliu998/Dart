import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FinalReview } from "@/features/review/final-review";
import { createAgentRunBundle } from "@/lib/agent/demo";
import { agentApi } from "@/lib/api/agent";
import type { TenderResponse } from "@/lib/api/responses";
import type { EvidenceMatchGroup, PackageNode, RemediationTask } from "@/lib/phase-data/types";
import type { DisqualificationItem, Requirement } from "@/lib/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const requirements: Requirement[] = [{ id: "req-1", code: "REQ-1", title: "营业执照", category: "资格", mandatory: true, disqualification: false, risk: "medium", status: "review", evidence: null, confidence: .6, owner: "张工", dueDate: "2026-07-20", page: 4, clause: "3.1", originalText: "提供营业执照", normalizedText: "提供营业执照", expectedEvidence: "营业执照", actualValue: "待核验", rule: "人工复核", reasoning: "待确认", sourceDocument: "招标文件", sourceVersion: "V1" }];
const disqualifications: DisqualificationItem[] = [{ id: "dq-1", title: "资质缺失", status: "rule_hit", risk: "fatal", source: "招标文件", page: 8, trigger: "资质", evidence: "暂无", response: "待处理", remediation: "补齐", owner: "李工", dueDate: "2026-07-20", approver: "王工" }];
const matches: EvidenceMatchGroup[] = [{ id: "match-1", requirementCode: "REQ-1", requirementTitle: "营业执照", risk: "medium", requirementStatus: "review", page: 4, selectedEvidenceIds: ["asset-1"], candidates: [{ id: "candidate-1", evidenceId: "asset-1", name: "营业执照.pdf", score: .93, reason: [], legalEntity: "测试公司", validUntil: "长期", completeness: 1, decision: "accepted" }] }];
const tasks: RemediationTask[] = [{ id: "task-1", title: "补齐资质", priority: "high", status: "todo", owner: "李工", reviewer: "王工", dueDate: "2026-07-20", sourceType: "requirement", sourceLabel: "REQ-1", reason: "缺失", evidence: "", steps: [], attachments: 0, comments: 0 }];
const responses: TenderResponse[] = [{ id: "rsp-1", projectId: "p-1", requirementId: "req-1", status: "needs_review", strategy: "引用营业执照", draftText: "草稿", editedText: null, missingInformation: [], riskNotes: [], confidence: .8, generationVersion: 1, version: 1, evidenceClaimIds: ["claim-1"] }];
const packageTree: PackageNode[] = [{ id: "folder", name: "投标文件", type: "folder", status: "valid", children: [{ id: "file-1", name: "投标响应.docx", type: "file", status: "valid" }] }];

describe("FinalReview", () => {
  it("aggregates existing workbench facts and routes review and export work", () => {
    const bundle = createAgentRunBundle("p-1");
    bundle.run.mode = "autonomous_draft";
    bundle.run.status = "completed";
    bundle.run.completionReason = "final_work_package_approved";
    render(<FinalReview projectId="p-1" data={{ requirements, disqualifications, matches, tasks, responses, packageTree }} agentResult={{ source: "demo", data: bundle, error: null }} />);
    expect(screen.getByText("Agent 自主草稿已完成")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /招标要求/ })).toHaveAttribute("href", "/projects/p-1/requirements");
    expect(screen.getByRole("link", { name: /打开封装与下载/ })).toHaveAttribute("href", "/projects/p-1/package");
    expect(screen.getByText("导出文件")).toBeInTheDocument();
    expect(screen.getAllByText("否决风险").length).toBeGreaterThan(0);
  });

  it("shows API read failures explicitly without a fabricated fallback", () => {
    render(<FinalReview projectId="p-1" data={{ requirements: [], disqualifications: [], matches: [], tasks: [], responses: [], packageTree: [] }} agentResult={{ source: "failure", data: null, error: { code: "agent_run_request_failed", message: "Agent 运行请求失败：API_503。", retryable: true } }} errors={["投标响应：API_503"]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("部分复核数据不可用");
    expect(screen.getByRole("alert")).toHaveTextContent("未使用演示数据替代失败接口");
    expect(screen.queryByText("Agent 自主草稿已完成")).not.toBeInTheDocument();
  });

  it("only completes the pending final work package review with a non-empty audited reason", async () => {
    const user = userEvent.setup();
    const approve = vi.spyOn(agentApi, "approve").mockResolvedValue({ ok: true });
    const bundle = createAgentRunBundle("p-1");
    bundle.approvals.push({ id: "approval-final", runId: bundle.run.id, stepId: "step-export", type: "final_work_package_review", title: "最终工作包复核", description: "请确认工作包。", impactSummary: "", reversible: false, reason: "", risk: "high", status: "pending", requiredRole: "投标负责人", destinationLabel: "打开最终工作包复核", href: "/projects/p-1/review", sourceReferences: [] });
    render(<FinalReview projectId="p-1" data={{ requirements, disqualifications, matches, tasks, responses, packageTree }} agentResult={{ source: "api", data: bundle, error: null }} />);
    await user.click(screen.getByRole("button", { name: "标记本轮复核完成" }));
    expect(approve).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("请填写本轮复核说明");
    await user.type(screen.getByLabelText("复核说明"), "已逐项检查工作包。");
    await user.click(screen.getByRole("button", { name: "标记本轮复核完成" }));
    expect(approve).toHaveBeenCalledWith("approval-final", { reason: "已逐项检查工作包。" });
    expect(refresh).toHaveBeenCalledOnce();
    approve.mockRestore();
  });
});
