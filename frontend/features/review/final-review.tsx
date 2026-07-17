"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, ArrowRight, Bot, CheckCircle2, ClipboardCheck, FileDown, FileText, ListChecks, Scale, ShieldAlert } from "lucide-react";
import type { AgentDataResult, AgentRunBundle } from "@/lib/agent/types";
import { agentApi } from "@/lib/api/agent";
import type { TenderResponse } from "@/lib/api/responses";
import type { EvidenceMatchGroup, PackageNode, RemediationTask } from "@/lib/phase-data/types";
import type { DisqualificationItem, Requirement } from "@/lib/types";
import styles from "./final-review.module.css";

type ReviewData = {
  requirements: Requirement[];
  disqualifications: DisqualificationItem[];
  matches: EvidenceMatchGroup[];
  tasks: RemediationTask[];
  responses: TenderResponse[];
  packageTree: PackageNode[];
};

export function FinalReview({ projectId, data, agentResult, errors = [] }: { projectId: string; data: ReviewData; agentResult: AgentDataResult<AgentRunBundle>; errors?: string[] }) {
  const router = useRouter();
  const [reviewReason, setReviewReason] = useState("");
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const unresolvedDisqualifications = data.disqualifications.filter((item) => item.status !== "resolved" && item.status !== "waived");
  const matched = data.matches.filter((item) => item.selectedEvidenceIds.length > 0).length;
  const pendingMatches = data.matches.flatMap((item) => item.candidates).filter((item) => item.decision === "pending").length;
  const missingMaterials = data.requirements.filter((item) => item.status === "missing").length + data.responses.filter((item) => item.status === "missing_evidence").length;
  const focus = data.requirements.filter((item) => item.status === "review" || item.confidence < .7).length + pendingMatches + data.responses.filter((item) => item.status === "needs_review").length + data.tasks.filter((item) => item.status !== "done").length;
  const files = flattenFiles(data.packageTree);
  const run = agentResult.data?.run;
  const artifacts = agentResult.data?.outputs.filter((item) => item.href) ?? [];
  const finalApproval = agentResult.data?.approvals.find((item) => item.type === "final_work_package_review" && item.status === "pending");
  const autonomousDraftComplete = run?.mode === "autonomous_draft" && (Boolean(finalApproval) || run.completionReason === "final_work_package_approved");
  const autonomousPartial = run?.mode === "autonomous_draft" && run.status === "completed" && !autonomousDraftComplete;

  async function completeReview() {
    if (!finalApproval) return;
    if (!reviewReason.trim()) { setApprovalFeedback("请填写本轮复核说明后再标记完成。 "); return; }
    setApproving(true); setApprovalFeedback(null);
    try {
      await agentApi.approve(finalApproval.id, { reason: reviewReason.trim() });
      setApprovalFeedback("本轮最终复核已标记完成，正在刷新工作包状态。");
      router.refresh();
    } catch (error) {
      setApprovalFeedback(`未能标记本轮复核完成：${error instanceof Error ? error.message : "未知错误"}。`);
    } finally { setApproving(false); }
  }

  return <main className="page">
    <header className="page-header"><div className="page-title-group"><span className="project-code">最终人工复核</span><h1>自主草稿工作包</h1><p>集中查看 Agent 草稿的可交付状态；最终判断仍须由人工在原工作台完成。</p></div><div className="header-actions"><Link className="button" href={`/agent?project=${projectId}`}><Bot size={15} />查看 Agent</Link><Link className="button primary" href={`/projects/${projectId}/package`}><FileDown size={15} />打开封装与下载</Link></div></header>
    {autonomousDraftComplete ? <section className={`${styles.notice} ${styles.success}`} role="status"><CheckCircle2 size={18} /><div><strong>Agent 自主草稿已完成</strong><small>{run?.summary || "已生成草稿工作包，现进入最终人工复核。"}</small></div></section> : <section className={styles.notice} role="status"><Bot size={18} /><div><strong>{autonomousPartial ? "Agent 已停止，结果不完整" : "等待最终人工复核"}</strong><small>{run ? `当前运行：${run.summary}` : "尚未读取到 Agent 运行；以下仅展示已成功读取的工作台数据。"}</small></div></section>}
    {errors.length > 0 && <section className="mutation-feedback warning" role="alert"><AlertOctagon size={16} /><span><strong>部分复核数据不可用</strong><small>{errors.join("；")}。页面未使用演示数据替代失败接口。</small></span></section>}
    {finalApproval && <section className={styles.approval} aria-label="最终工作包复核"><div><CheckCircle2 size={18} /><span><strong>确认本轮最终复核完成</strong><small>{finalApproval.description || "确认已完成当前工作包的人工复核；该操作会写入 Agent 审计记录。"}</small></span></div><label><span>复核说明（必填）</span><textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="例如：已逐项核对否决风险、响应草稿和封装检查结果。" aria-label="复核说明" /></label><footer><small>仅提交当前待处理的最终工作包复核请求。</small><button className="button primary" type="button" disabled={approving} onClick={completeReview}>{approving ? "正在标记…" : "标记本轮复核完成"}</button></footer>{approvalFeedback && <p className={approvalFeedback.startsWith("未能") || approvalFeedback.startsWith("请填写") ? styles.approvalError : styles.approvalSuccess} role="alert">{approvalFeedback}</p>}</section>}

    <section className={styles.metrics} aria-label="最终复核概况">
      <Metric href={`/projects/${projectId}/requirements`} label="招标要求" value={data.requirements.length} detail="回到原文逐条复核" icon={<ListChecks size={17} />} />
      <Metric href={`/projects/${projectId}/disqualifications`} label="否决风险" value={unresolvedDisqualifications.length} detail={`${unresolvedDisqualifications.filter((item) => item.status === "confirmed" || item.status === "rule_hit").length} 项已命中规则`} icon={<ShieldAlert size={17} />} tone="fatal" />
      <Metric href={`/projects/${projectId}/evidence-matching`} label="证据匹配" value={`${matched}/${data.matches.length}`} detail={`${pendingMatches} 个候选待决定`} icon={<Scale size={17} />} />
      <Metric href={`/projects/${projectId}/tasks`} label="缺失材料" value={missingMaterials} detail="要求或响应标记缺少材料" icon={<ClipboardCheck size={17} />} tone="warning" />
      <Metric href={`/projects/${projectId}/responses`} label="投标响应" value={data.responses.length} detail={`${data.responses.filter((item) => item.status === "approved").length} 条已批准`} icon={<FileText size={17} />} />
      <Metric href={`/projects/${projectId}/tasks`} label="待人工重点检查" value={focus} detail="低置信度、待决定、待复核与待整改" icon={<AlertOctagon size={17} />} tone="warning" />
    </section>

    <div className={styles.grid}>
      <section className="panel"><div className="panel-header"><div><h2>人工复核入口</h2><p>所有结论都回到对应业务工作台确认并留痕。</p></div></div><div className={styles.links}>
        <ReviewLink href={`/projects/${projectId}/requirements`} title="要求与来源" detail={`${data.requirements.filter((item) => item.status === "review" || item.confidence < .7).length} 项需确认`} />
        <ReviewLink href={`/projects/${projectId}/evidence-matching`} title="证据匹配" detail={`${pendingMatches} 个候选待人工决定`} />
        <ReviewLink href={`/projects/${projectId}/responses`} title="投标响应" detail={`${data.responses.filter((item) => item.status !== "approved" && item.status !== "excluded").length} 条未批准`} />
        <ReviewLink href={`/projects/${projectId}/disqualifications`} title="否决风险" detail={`${unresolvedDisqualifications.length} 项未关闭`} />
        <ReviewLink href={`/projects/${projectId}/tasks`} title="整改任务" detail={`${data.tasks.filter((item) => item.status !== "done").length} 项未完成`} />
      </div></section>
      <section className="panel"><div className="panel-header"><div><h2>导出文件</h2><p>下载使用现有文件封装工作台，确保封装检查与下载路径一致。</p></div><Link href={`/projects/${projectId}/package`}>全部文件 <ArrowRight size={13} /></Link></div><div className={styles.files}>{artifacts.length > 0 ? artifacts.map((item) => <Link key={item.id} href={item.href}><FileDown size={15} /><span><strong>{item.title || "导出产物"}</strong><small>{item.summary || "打开或下载 Agent 生成的产物"}</small></span><ArrowRight size={13} /></Link>) : files.length > 0 ? files.slice(0, 6).map((file) => <Link key={file.id} href={`/projects/${projectId}/package`}><FileText size={15} /><span><strong>{file.name}</strong><small>{file.status === "valid" ? "已纳入封装，打开工作台下载" : "需在封装工作台处理"}</small></span><ArrowRight size={13} /></Link>) : <p className={styles.empty}>暂无可导出文件。请在文件封装工作台生成并校验交付物。</p>}</div></section>
    </div>
  </main>;
}

function Metric({ href, label, value, detail, icon, tone = "" }: { href: string; label: string; value: string | number; detail: string; icon: React.ReactNode; tone?: string }) { return <Link className={`${styles.metric} ${tone === "fatal" ? styles.fatal : tone === "warning" ? styles.warning : ""}`} href={href}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div><ArrowRight size={14} /></Link>; }
function ReviewLink({ href, title, detail }: { href: string; title: string; detail: string }) { return <Link className={styles.reviewLink} href={href}><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={14} /></Link>; }
function flattenFiles(nodes: PackageNode[]): PackageNode[] { return nodes.flatMap((node) => node.type === "file" ? [node] : flattenFiles(node.children ?? [])); }
