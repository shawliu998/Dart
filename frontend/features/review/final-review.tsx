"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
} from "lucide-react";
import type { AgentDataResult, AgentRunBundle } from "@/lib/agent/types";
import { agentApi } from "@/lib/api/agent";
import type { TenderResponse } from "@/lib/api/responses";
import type {
  EvidenceMatchGroup,
  PackageNode,
  RemediationTask,
} from "@/lib/phase-data/types";
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

type ReviewItem = {
  id: string;
  title: string;
  detail: string;
  count: number;
  href: string;
  action: string;
  tone: "fatal" | "attention" | "ready";
};

export function FinalReview({
  projectId,
  data,
  agentResult,
  errors = [],
}: {
  projectId: string;
  data: ReviewData;
  agentResult: AgentDataResult<AgentRunBundle>;
  errors?: string[];
}) {
  const router = useRouter();
  const [reviewReason, setReviewReason] = useState("");
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const unresolvedDisqualifications = data.disqualifications.filter(
    (item) => item.status !== "resolved" && item.status !== "waived",
  );
  const fatalDisqualifications = unresolvedDisqualifications.filter(
    (item) => item.status === "confirmed" || item.status === "rule_hit",
  ).length;
  const requirementReviewCount = data.requirements.filter(
    (item) => item.status === "review" || item.confidence < 0.7,
  ).length;
  const missingRequirements = data.requirements.filter(
    (item) => item.status === "missing",
  ).length;
  const pendingMatches = data.matches
    .flatMap((item) => item.candidates)
    .filter((item) => item.decision === "pending").length;
  const pendingResponses = data.responses.filter(
    (item) =>
      item.status !== "approved" &&
      item.status !== "excluded" &&
      item.status !== "missing_evidence",
  ).length;
  const missingResponses = data.responses.filter(
    (item) => item.status === "missing_evidence",
  ).length;
  const openTasks = data.tasks.filter((item) => item.status !== "done").length;
  const packageIssues = flattenNodes(data.packageTree).filter(
    (item) => item.status === "missing" || item.status === "warning",
  ).length;
  const files = flattenFiles(data.packageTree);
  const run = agentResult.data?.run;
  const artifacts = agentResult.data?.outputs.filter((item) => item.href) ?? [];
  const finalApproval = agentResult.data?.approvals.find(
    (item) =>
      item.type === "final_work_package_review" && item.status === "pending",
  );
  const autonomousDraftComplete =
    run?.mode === "autonomous_draft" &&
    (Boolean(finalApproval) ||
      run.completionReason === "final_work_package_approved");
  const autonomousPartial =
    run?.mode === "autonomous_draft" &&
    run.status === "completed" &&
    !autonomousDraftComplete;

  const reviewItems: ReviewItem[] = [
    {
      id: "disqualifications",
      title: "否决风险",
      detail: fatalDisqualifications
        ? `${fatalDisqualifications} 项已命中规则，须由人工关闭或明确处理`
        : "没有未处理的规则命中项",
      count: unresolvedDisqualifications.length,
      href: `/projects/${projectId}/disqualifications`,
      action: "处理风险",
      tone: unresolvedDisqualifications.length ? "fatal" : "ready",
    },
    {
      id: "requirements",
      title: "要求与来源",
      detail: missingRequirements
        ? `${missingRequirements} 项缺少材料，${requirementReviewCount} 项仍需核对原文`
        : `${requirementReviewCount} 项仍需核对原文或低置信度结果`,
      count: requirementReviewCount + missingRequirements,
      href: `/projects/${projectId}/requirements`,
      action: "核对要求",
      tone:
        requirementReviewCount + missingRequirements ? "attention" : "ready",
    },
    {
      id: "evidence",
      title: "证据匹配",
      detail: pendingMatches
        ? `${pendingMatches} 个候选尚未形成正式证据绑定`
        : "候选证据均已完成人工决定",
      count: pendingMatches,
      href: `/projects/${projectId}/evidence-matching`,
      action: "复核证据",
      tone: pendingMatches ? "attention" : "ready",
    },
    {
      id: "responses",
      title: "投标响应",
      detail: missingResponses
        ? `${missingResponses} 条缺少证据，${pendingResponses} 条仍待复核`
        : `${pendingResponses} 条响应仍待人工复核`,
      count: pendingResponses + missingResponses,
      href: `/projects/${projectId}/responses`,
      action: "复核响应",
      tone: missingResponses || pendingResponses ? "attention" : "ready",
    },
    {
      id: "tasks",
      title: "整改任务",
      detail: openTasks
        ? `${openTasks} 项仍在待办、处理中或待复核`
        : "整改任务已全部完成",
      count: openTasks,
      href: `/projects/${projectId}/tasks`,
      action: "查看任务",
      tone: openTasks ? "attention" : "ready",
    },
    {
      id: "package",
      title: "交付包检查",
      detail: packageIssues
        ? `${packageIssues} 个文件或目录仍有缺失/警告`
        : `${files.length} 个文件已进入交付目录`,
      count: packageIssues,
      href: `/projects/${projectId}/package`,
      action: "查看交付包",
      tone: packageIssues ? "attention" : "ready",
    },
  ];
  const outstandingCount = reviewItems.reduce(
    (total, item) => total + item.count,
    0,
  );
  const readyCount = reviewItems.filter((item) => item.count === 0).length;

  async function completeReview() {
    if (!finalApproval) return;
    if (!reviewReason.trim()) {
      setApprovalFeedback("请填写本轮复核说明后再标记完成。");
      return;
    }
    setApproving(true);
    setApprovalFeedback(null);
    try {
      await agentApi.approve(finalApproval.id, {
        reason: reviewReason.trim(),
      });
      setApprovalFeedback("本轮最终复核已标记完成，正在刷新工作包状态。");
      router.refresh();
    } catch (error) {
      setApprovalFeedback(
        `未能标记本轮复核完成：${
          error instanceof Error ? error.message : "未知错误"
        }。`,
      );
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title-group">
          <h1>最终复核</h1>
          <p>按优先级完成剩余人工检查，再提交本轮工作包复核结论。</p>
        </div>
        <div className="header-actions">
          <Link className="button" href={`/projects/${projectId}/package`}>
            查看交付包
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {errors.length > 0 && (
        <section className="mutation-feedback warning" role="alert">
          <AlertOctagon size={16} />
          <span>
            <strong>部分复核数据不可用</strong>
            <small>{errors.join("；")}。页面未使用演示数据替代失败接口。</small>
          </span>
        </section>
      )}

      <section className={styles.summary} aria-label="最终复核状态">
        <div>
          <strong>
            {outstandingCount
              ? `${outstandingCount} 项仍需人工关注`
              : "所有终审分组均已就绪"}
          </strong>
          <span>
            {readyCount}/{reviewItems.length} 个分组已就绪 ·
            按列表顺序回到原工作台处理
          </span>
        </div>
        <span
          className={`${styles.summaryState} ${
            outstandingCount ? styles.attention : styles.ready
          }`}
        >
          {outstandingCount ? "复核进行中" : "可提交结论"}
        </span>
      </section>

      <div className={styles.layout}>
        <section className={`panel ${styles.queue}`}>
          <div className="panel-header">
            <div>
              <h2>终审清单</h2>
              <p>先处理阻断与缺失，再完成其余人工确认。</p>
            </div>
            <span>{reviewItems.length} 个复核分组</span>
          </div>
          <div className={styles.reviewList}>
            {reviewItems.map((item, index) => (
              <ReviewRow key={item.id} item={item} sequence={index + 1} />
            ))}
          </div>
        </section>

        <aside className={styles.side}>
          <section className={`panel ${styles.packageStatus}`}>
            <header>
              <div>
                <h2>当前工作包</h2>
                <p>终审清单与交付产物的汇总状态。</p>
              </div>
              {autonomousDraftComplete ? (
                <CheckCircle2 size={18} />
              ) : autonomousPartial ? (
                <AlertTriangle size={18} />
              ) : (
                <ClipboardCheck size={18} />
              )}
            </header>
            <dl>
              <div>
                <dt>工作包状态</dt>
                <dd>
                  {autonomousDraftComplete
                    ? "已生成，等待或已完成人工结论"
                    : autonomousPartial
                      ? "生成不完整，需检查前置工作"
                      : "前置复核仍在进行"}
                </dd>
              </div>
              <div>
                <dt>交付文件</dt>
                <dd>{files.length} 个文件已进入当前目录</dd>
              </div>
              <div>
                <dt>关联产物</dt>
                <dd>{artifacts.length} 项可从原工作台查看</dd>
              </div>
            </dl>
            <Link href={`/projects/${projectId}/package`}>
              查看交付包状态
              <ArrowRight size={13} />
            </Link>
          </section>

          <section
            className={`panel ${styles.approval}`}
            aria-label="最终工作包复核"
          >
            <header>
              <FileCheck2 size={18} />
              <div>
                <h2>提交人工结论</h2>
                <p>
                  {finalApproval
                    ? "说明本轮核对范围与判断依据，然后完成当前复核请求。"
                    : "完成前置工作后，这里会开放当前工作包的复核请求。"}
                </p>
              </div>
            </header>
            {finalApproval ? (
              <>
                <label>
                  <span>复核说明（必填）</span>
                  <textarea
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                    placeholder="例如：已核对否决风险、响应草稿和交付包检查结果。"
                    aria-label="复核说明"
                  />
                </label>
                <footer>
                  <small>仅提交当前待处理的最终工作包复核请求。</small>
                  <button
                    className="button primary"
                    type="button"
                    disabled={approving}
                    onClick={completeReview}
                  >
                    {approving ? "正在提交…" : "完成本轮人工复核"}
                  </button>
                </footer>
              </>
            ) : (
              <p className={styles.pending}>
                本轮暂无待处理的最终复核请求。请先按左侧清单完成前置检查。
              </p>
            )}
            {approvalFeedback && (
              <p
                className={
                  approvalFeedback.startsWith("未能") ||
                  approvalFeedback.startsWith("请填写")
                    ? styles.approvalError
                    : styles.approvalSuccess
                }
                role="alert"
              >
                {approvalFeedback}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ReviewRow({ item, sequence }: { item: ReviewItem; sequence: number }) {
  return (
    <article className={styles.reviewRow}>
      <span className={`${styles.reviewState} ${styles[item.tone]}`}>
        {item.tone === "ready" ? (
          <Check size={13} />
        ) : item.tone === "fatal" ? (
          <AlertOctagon size={13} />
        ) : (
          <AlertTriangle size={13} />
        )}
      </span>
      <span className={styles.sequence}>{sequence}</span>
      <div>
        <strong>{item.title}</strong>
        <small>{item.detail}</small>
      </div>
      <span
        className={`${styles.count} ${
          item.count ? styles[item.tone] : styles.ready
        }`}
      >
        {item.count ? `${item.count} 项` : "已就绪"}
      </span>
      <Link href={item.href}>
        {item.action}
        <ArrowRight size={13} />
      </Link>
    </article>
  );
}

function flattenNodes(nodes: PackageNode[]): PackageNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}

function flattenFiles(nodes: PackageNode[]): PackageNode[] {
  return nodes.flatMap((node) =>
    node.type === "file" ? [node] : flattenFiles(node.children ?? []),
  );
}
