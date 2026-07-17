import { DEMO_PROJECT_ID, requirements } from "@/lib/demo/data";
import {
  amendments,
  auditRecords,
  consistencyIssues,
  evidenceMatchGroups,
  packageChecks,
  remediationTasks,
} from "@/lib/phase-data/demo";
import type { AgentApproval, AgentOutput, AgentRunBundle, AgentSnapshot, AgentStep } from "./types";

export const AGENT_DEMO_RUN_ID = "agent-run-demo-20260716";
export const AGENT_DEMO_UPDATED_AT = "2026-07-16 14:30";

export function createDemoAgentSnapshot(): AgentSnapshot {
  return {
    requirementCount: requirements.length,
    reviewRequirementCount: requirements.filter((item) => item.status === "review" || item.confidence < 0.7).length,
    fatalRequirementCount: requirements.filter((item) => item.risk === "fatal" && item.status !== "met").length,
    pendingMatchCount: evidenceMatchGroups.flatMap((group) => group.candidates).filter((item) => item.decision === "pending").length,
    openConsistencyCount: consistencyIssues.filter((item) => item.status === "open" || item.status === "review").length,
    pendingAmendmentCount: amendments.flatMap((item) => item.changes).filter((item) => item.status === "pending").length,
    openTaskCount: remediationTasks.filter((item) => item.status !== "done").length,
    failedPackageCheckCount: packageChecks.filter((item) => item.status === "failed").length,
    auditEventCount: auditRecords.length,
    primarySource: {
      document: "招标文件.pdf",
      page: 21,
      excerpt: "投标人须提供有效期内的信息安全管理体系认证证书。",
      confidence: 0.96,
      reviewState: "manual_review",
    },
    updatedAt: AGENT_DEMO_UPDATED_AT,
    evidenceAssetCount: 5,
    evidenceClaimCount: 12,
    evidenceClaimFailedAssetCount: 1,
    responseCount: 8,
    missingEvidenceResponseCount: 2,
    responseQualityIssueCount: 3,
    responseQualityRepairedCount: 1,
    remediationTaskCreatedCount: 4,
  };
}

const sourceFor = (snapshot: AgentSnapshot) => snapshot.primarySource;

export function createAgentRunBundle(projectId: string, snapshot: AgentSnapshot = createDemoAgentSnapshot()): AgentRunBundle {
  const runId = AGENT_DEMO_RUN_ID;
  const projectHref = (path: string) => `/projects/${projectId}/${path}`;
  const approvals: AgentApproval[] = [
    {
      id: "approval-fatal-requirement",
      runId,
      stepId: "step-requirements",
      type: "compliance_override",
      title: "复核致命要求与低置信度提取",
      description: "对照原文确认要求是否准确，以及风险候选是否需要进入整改。",
      impactSummary: "确认后会更新要求复核状态；不会自动形成法律资格结论。",
      reversible: true,
      reason: `${snapshot.fatalRequirementCount} 项致命要求未满足；任何否决结论必须由人工确认。`,
      risk: "fatal",
      status: "pending",
      requiredRole: "投标负责人 / 法务复核人",
      destinationLabel: "打开要求复核工作台",
      href: projectHref("requirements"),
      sourceReferences: [sourceFor(snapshot)],
    },
    {
      id: "approval-evidence-match",
      runId,
      stepId: "step-evidence",
      type: "evidence_match",
      title: "确认候选证据匹配",
      description: "逐项接受或拒绝候选材料，并补充人工判断理由。",
      impactSummary: "接受后材料可用于合规矩阵；不会改写材料原件。",
      reversible: true,
      reason: `${snapshot.pendingMatchCount} 个候选匹配待人工接受或拒绝，Agent 不会自动绑定证据。`,
      risk: "high",
      status: "pending",
      requiredRole: "材料负责人",
      destinationLabel: "打开证据匹配工作台",
      href: projectHref("evidence-matching"),
      sourceReferences: [sourceFor(snapshot)],
    },
    {
      id: "approval-package-blockers",
      runId,
      stepId: "step-package",
      type: "package_warning",
      title: "处理封装阻塞后再生成交付包",
      description: "先修复确定性校验失败项，再由终审人执行包生成批准。",
      impactSummary: "当前请求只导航到封装中心，不生成、签署或提交外部平台。",
      reversible: false,
      reason: `${snapshot.failedPackageCheckCount} 项确定性封装检查失败，当前禁止生成最终包。`,
      risk: "fatal",
      status: "pending",
      requiredRole: "交付负责人 / 终审人",
      destinationLabel: "打开文件封装中心",
      href: projectHref("package"),
      sourceReferences: [{
        document: "内部封装规则 PKG-FMT-01",
        page: null,
        excerpt: "必要文件、证书有效期及文件一致性检查必须全部通过。",
        confidence: null,
        reviewState: "rule_result",
      }],
    },
  ];

  const outputs: AgentOutput[] = [
    { id: "output-requirements", runId, stepId: "step-requirements", type: "requirement", kind: "requirements", title: "要求与风险矩阵", description: "结构化要求及其复核状态。", summary: `${snapshot.requirementCount} 项要求已进入结构化矩阵，${snapshot.reviewRequirementCount} 项需人工复核。`, count: snapshot.requirementCount, severity: snapshot.fatalRequirementCount ? "fatal" : "info", href: projectHref("requirements"), createdAt: snapshot.updatedAt, provenance: [sourceFor(snapshot)] },
    { id: "output-evidence", runId, stepId: "step-evidence", type: "evidence", kind: "evidence", title: "证据候选队列", description: "可解释但尚未自动接受的证据候选。", summary: `${snapshot.pendingMatchCount} 个候选尚未形成正式证据绑定。`, count: snapshot.pendingMatchCount, severity: snapshot.pendingMatchCount ? "high" : "info", href: projectHref("evidence-matching"), createdAt: snapshot.updatedAt, provenance: [sourceFor(snapshot)] },
    { id: "output-evidence-claims", runId, stepId: "step-evidence-claims", artifactType: "evidence_claims", type: "evidence", kind: "evidence", title: "企业材料 Claim", description: "从企业材料抽取的可回溯证据 Claim。", summary: `已处理 ${snapshot.evidenceAssetCount ?? 0} 份企业材料，新增 ${snapshot.evidenceClaimCount ?? 0} 条 Claim。`, count: snapshot.evidenceClaimCount ?? 0, severity: (snapshot.evidenceClaimFailedAssetCount ?? 0) > 0 ? "high" : "info", href: projectHref("evidence-matching"), createdAt: snapshot.updatedAt, metrics: { assetCount: snapshot.evidenceAssetCount ?? 0, newClaimCount: snapshot.evidenceClaimCount ?? 0, failedAssetCount: snapshot.evidenceClaimFailedAssetCount ?? 0 }, provenance: [{ document: "企业材料库", page: null, excerpt: "从资质证书、财务报表等材料抽取 Claim；失败材料已隔离。", confidence: null, reviewState: "manual_review" }] },
    { id: "output-response-drafts", runId, stepId: "step-response-drafts", artifactType: "response_drafts", type: "report", kind: "audit", title: "投标响应草稿", description: "根据已接受证据生成的内部响应草稿。", summary: `共生成 ${snapshot.responseCount ?? 0} 条响应草稿，其中 ${snapshot.missingEvidenceResponseCount ?? 0} 条缺少证据链接。`, count: snapshot.responseCount ?? 0, severity: (snapshot.missingEvidenceResponseCount ?? 0) > 0 ? "medium" : "info", href: projectHref("responses"), createdAt: snapshot.updatedAt, metrics: { responseCount: snapshot.responseCount ?? 0, missingEvidenceCount: snapshot.missingEvidenceResponseCount ?? 0 }, provenance: [sourceFor(snapshot)] },
    { id: "output-response-quality", runId, stepId: "step-response-quality", artifactType: "response_quality_check", type: "report", kind: "audit", title: "响应草稿质量自查", description: "对内部响应草稿的确定性质量检查。", summary: `剩余 ${snapshot.responseQualityIssueCount ?? 0} 项质量问题；已自动修补 ${snapshot.responseQualityRepairedCount ?? 0} 项安全标注。`, count: snapshot.responseQualityIssueCount ?? 0, severity: (snapshot.responseQualityIssueCount ?? 0) > 0 ? "high" : "info", href: projectHref("responses"), createdAt: snapshot.updatedAt, metrics: { qualityIssueCount: snapshot.responseQualityIssueCount ?? 0, qualityRepairedCount: snapshot.responseQualityRepairedCount ?? 0 }, provenance: [{ document: "响应质量规则集", page: null, excerpt: "只检查并标注内部草稿，不修改已人工确认内容。", confidence: null, reviewState: "rule_result" }] },
    { id: "output-remediation-tasks", runId, stepId: "step-remediation-tasks", artifactType: "remediation_tasks", type: "task", kind: "task", title: "缺口补救任务", description: "本次运行创建的整改任务。", summary: `本次运行创建 ${snapshot.remediationTaskCreatedCount ?? 0} 项整改任务，已加入项目任务工作台。`, count: snapshot.remediationTaskCreatedCount ?? 0, severity: (snapshot.remediationTaskCreatedCount ?? 0) > 0 ? "medium" : "info", href: projectHref("tasks"), createdAt: snapshot.updatedAt, metrics: { remediationTaskCount: snapshot.remediationTaskCreatedCount ?? 0 }, provenance: [{ document: "整改规则映射 v1.0", page: null, excerpt: "风险项只生成可追踪任务，不替代责任人和复核人的判断。", confidence: null, reviewState: "rule_result" }] },
    { id: "output-consistency", runId, stepId: "step-consistency", type: "risk", kind: "consistency", title: "跨文件一致性结果", description: "确定性规则发现的跨文件差异。", summary: `${snapshot.openConsistencyCount} 项金额、主体、日期或承诺差异待处理。`, count: snapshot.openConsistencyCount, severity: snapshot.openConsistencyCount ? "high" : "info", href: projectHref("consistency"), createdAt: snapshot.updatedAt, provenance: [{ document: "一致性规则集 v1.2", page: null, excerpt: "金额、主体、日期、人员和承诺采用确定性标准化比较。", confidence: null, reviewState: "rule_result" }] },
    { id: "output-amendment", runId, stepId: "step-amendment", type: "report", kind: "amendment", title: "补充公告影响清单", description: "补充公告前后文及影响范围报告。", summary: `${snapshot.pendingAmendmentCount} 项公告变更尚待应用或批准。`, count: snapshot.pendingAmendmentCount, severity: snapshot.pendingAmendmentCount ? "high" : "info", href: projectHref("amendments"), createdAt: snapshot.updatedAt, provenance: [{ document: "补充公告01.pdf", page: 3, excerpt: "数据采集并发量由每秒 5,000 条调整为每秒 8,000 条。", confidence: 0.91, reviewState: "manual_review" }] },
    { id: "output-tasks", runId, stepId: "step-tasks", type: "task", kind: "task", title: "整改任务队列", description: "从已确认风险映射的可跟踪整改任务。", summary: `${snapshot.openTaskCount} 项任务仍在待办、处理中或复核中。`, count: snapshot.openTaskCount, severity: snapshot.openTaskCount ? "high" : "info", href: projectHref("tasks"), createdAt: snapshot.updatedAt, provenance: [{ document: "整改规则映射 v1.0", page: null, excerpt: "风险项只生成可追踪任务，不替代责任人和复核人的判断。", confidence: null, reviewState: "rule_result" }] },
    { id: "output-package", runId, stepId: "step-package", type: "package", kind: "package", title: "封装就绪检查", description: "最终包生成前的确定性完整性检查。", summary: `${snapshot.failedPackageCheckCount} 项阻塞检查失败，最终包保持锁定。`, count: snapshot.failedPackageCheckCount, severity: snapshot.failedPackageCheckCount ? "fatal" : "info", href: projectHref("package"), createdAt: snapshot.updatedAt, provenance: [{ document: "内部封装规则 PKG-META-02", page: null, excerpt: "缺件、过期证书与一致性失败会阻止最终包生成。", confidence: null, reviewState: "rule_result" }] },
    { id: "output-audit", runId, stepId: "step-audit", type: "report", kind: "audit", title: "本次运行审计轨迹", description: "模型、规则和人工事件的追加式运行报告。", summary: `${snapshot.auditEventCount} 条模型、规则及人工事件可回溯。`, count: snapshot.auditEventCount, severity: "info", href: projectHref("audit"), createdAt: snapshot.updatedAt, provenance: [{ document: "Append-only audit log", page: null, excerpt: "每次运行、人工更正及规则结果均保留输入、输出和版本信息。", confidence: null, reviewState: "verified" }] },
  ];

  const steps: AgentStep[] = [
    { id: "step-ingest", runId, sequence: 1, title: "文档接收与解析", description: "验证文件、版本和解析状态。", status: "completed", actor: "deterministic_rule", tool: "DocumentIngestionService", startedAt: "2026-07-16 14:12", finishedAt: "2026-07-16 14:13", outputIds: [], approvalIds: [], message: "主招标文件与补充公告已进入受控版本链。" },
    { id: "step-requirements", runId, sequence: 2, title: "要求提取与人工门禁", description: "结构化候选要求；低置信度与致命项必须人工复核。", status: "blocked", actor: "mock_model", tool: "RequirementExtractionAgent / MockLLMProvider", sources: [sourceFor(snapshot)], startedAt: "2026-07-16 14:13", finishedAt: "2026-07-16 14:15", outputIds: ["output-requirements"], approvalIds: ["approval-fatal-requirement"], message: `${snapshot.reviewRequirementCount} 项要求等待复核。` },
    { id: "step-evidence", runId, sequence: 3, title: "证据候选匹配", description: "只推荐可解释候选，不自动接受匹配。", status: "blocked", actor: "mock_model", tool: "EvidenceMatchingAgent / MockLLMProvider", sources: [sourceFor(snapshot)], startedAt: "2026-07-16 14:15", finishedAt: "2026-07-16 14:17", outputIds: ["output-evidence"], approvalIds: ["approval-evidence-match"], message: `${snapshot.pendingMatchCount} 个候选待决定。` },
    { id: "step-evidence-claims", runId, sequence: 4, title: "抽取企业材料 Claim", description: "从企业材料抽取可回溯的证据 Claim；失败的材料单独隔离。", status: "completed", actor: "deterministic_rule", tool: "EvidenceClaimExtraction", startedAt: "2026-07-16 14:17", finishedAt: "2026-07-16 14:18", outputIds: ["output-evidence-claims"], approvalIds: [], message: `已处理 ${snapshot.evidenceAssetCount} 份材料，新增 ${snapshot.evidenceClaimCount} 条 Claim。` },
    { id: "step-response-drafts", runId, sequence: 5, title: "生成投标响应草稿", description: "根据已接受证据生成可编辑的响应草稿。", status: "completed", actor: "mock_model", tool: "ResponseDraftService", startedAt: "2026-07-16 14:18", finishedAt: "2026-07-16 14:20", outputIds: ["output-response-drafts"], approvalIds: [], message: `已生成 ${snapshot.responseCount} 条响应草稿。` },
    { id: "step-response-quality", runId, sequence: 6, title: "检查并修补响应草稿", description: "对内部响应草稿运行确定性质量检查并应用安全标注修补。", status: "completed", actor: "deterministic_rule", tool: "ResponseQualityCheck", startedAt: "2026-07-16 14:20", finishedAt: "2026-07-16 14:21", outputIds: ["output-response-quality"], approvalIds: [], message: `剩余 ${snapshot.responseQualityIssueCount} 项质量问题；已修补 ${snapshot.responseQualityRepairedCount} 项。` },
    { id: "step-remediation-tasks", runId, sequence: 7, title: "生成缺口补救任务", description: "把未解决的合规与响应缺口映射为项目整改任务。", status: "completed", actor: "deterministic_rule", tool: "RemediationTaskService", startedAt: "2026-07-16 14:21", finishedAt: "2026-07-16 14:22", outputIds: ["output-remediation-tasks"], approvalIds: [], message: `已创建 ${snapshot.remediationTaskCreatedCount} 项整改任务。` },
    { id: "step-consistency", runId, sequence: 8, title: "确定性合规与一致性检查", description: "金额、日期、计数和结果仅由规则计算。", status: snapshot.openConsistencyCount ? "blocked" : "completed", actor: "deterministic_rule", tool: "ComplianceRuleEngine", startedAt: "2026-07-16 14:22", finishedAt: "2026-07-16 14:24", outputIds: ["output-consistency"], approvalIds: [], message: snapshot.openConsistencyCount ? `${snapshot.openConsistencyCount} 项差异阻止就绪。` : "全部规则检查通过。" },
    { id: "step-amendment", runId, sequence: 9, title: "补充公告影响分析", description: "定位变更并路由至要求、证据和任务。", status: snapshot.pendingAmendmentCount ? "blocked" : "completed", actor: "mock_model", tool: "AmendmentImpactAgent / MockLLMProvider", startedAt: "2026-07-16 14:24", finishedAt: "2026-07-16 14:26", outputIds: ["output-amendment"], approvalIds: [], message: `${snapshot.pendingAmendmentCount} 项变更待处理。` },
    { id: "step-tasks", runId, sequence: 10, title: "整改任务编排", description: "把已确认问题映射为负责人、截止时间与复核人。", status: snapshot.openTaskCount ? "running" : "completed", actor: "deterministic_rule", tool: "RemediationTaskService", startedAt: "2026-07-16 14:26", finishedAt: null, outputIds: ["output-tasks"], approvalIds: [], message: `${snapshot.openTaskCount} 项任务未完成。` },
    { id: "step-package", runId, sequence: 11, title: "交付封装门禁", description: "只有确定性检查和人工批准均通过后才允许生成。", status: "blocked", actor: "human_gate", tool: "PackageValidationService", startedAt: null, finishedAt: null, outputIds: ["output-package"], approvalIds: ["approval-package-blockers"], message: `${snapshot.failedPackageCheckCount} 项检查失败。` },
    { id: "step-audit", runId, sequence: 12, title: "追加式审计", description: "记录运行版本、来源、结果和人工更正。", status: "completed", actor: "deterministic_rule", tool: "AppendOnlyAuditService", startedAt: "2026-07-16 14:12", finishedAt: snapshot.updatedAt, outputIds: ["output-audit"], approvalIds: [], message: `${snapshot.auditEventCount} 条事件已入审计轨迹。` },
  ];

  const completed = steps.filter((step) => step.status === "completed").length;
  return {
    run: {
      id: runId,
      projectId,
      projectName: "智慧园区综合管理平台采购项目",
      title: "投标合规与交付编排",
      goal: "在保留来源、人工审批和审计轨迹的前提下，把招标文件转化为可交付、可复核的合规工作包。",
      mode: "supervised",
      scope: "full_bid_draft",
      maxIterations: 20,
      iteration: 6,
      currentAction: "等待人工处理整改任务与封装阻塞项",
      nextAction: "完成全部复核后执行交付封装检查",
      observation: `${snapshot.openTaskCount} 项整改任务未完成，${snapshot.failedPackageCheckCount} 项封装检查失败。`,
      status: approvals.some((item) => item.status === "pending") ? "waiting_approval" : snapshot.openTaskCount ? "running" : "completed",
      trigger: "amendment_received",
      startedAt: "2026-07-16 14:12",
      updatedAt: snapshot.updatedAt,
      progress: Math.round((completed / steps.length) * 100),
      currentStepId: "step-tasks",
      initiatedBy: "刘敏（投标负责人）",
      promptVersion: "bid-orchestrator@2.0-demo",
      policyVersion: "compliance-boundary@1.1",
      summary: `${approvals.length} 个人工门禁、${snapshot.openTaskCount} 项未完成任务、${snapshot.failedPackageCheckCount} 项封装阻塞。`,
      planStages: [],
      steps,
      approvals,
      outputs,
    },
    steps,
    approvals,
    outputs,
    events: [],
  };
}

export const AGENT_DEMO_PROJECT_ID = DEMO_PROJECT_ID;
export const agentDemoBundle = createAgentRunBundle(AGENT_DEMO_PROJECT_ID);
