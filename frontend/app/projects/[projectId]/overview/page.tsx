import Link from "next/link";
import { AlertOctagon, Bot, Check } from "lucide-react";
import styles from "./overview.module.css";
import { agentApi } from "@/lib/api/agent";
import { phaseApi } from "@/lib/api/phase2";
import { projectApi } from "@/lib/api/projects";
import { DEMO_NOW, formatDeadlineRemaining } from "@/lib/product-context";
import { RiskBadge } from "@/components/ui/badges";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DocumentAnalysisPanel } from "@/features/projects/document-analysis-panel";

const stages = ["文件解析", "要求确认", "证据匹配", "合规审查", "整改", "文件封装", "提交准备"];

type WorkflowRow = {
  id: string;
  title: string;
  detail: string;
  status: string;
  tone: "critical" | "warning" | "ready" | "neutral";
  pending: string;
  href: string;
};

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, requirements, disqualifications, matches, consistency, tasks, packageResult, audit, agentResult, documents] = await Promise.all([
    projectApi.get(projectId),
    projectApi.requirements(projectId),
    projectApi.disqualifications(projectId),
    phaseApi.evidenceMatches(projectId),
    phaseApi.consistency(projectId),
    phaseApi.tasks(projectId),
    phaseApi.package(projectId),
    phaseApi.audit(projectId),
    agentApi.getRun(projectId),
    projectApi.documents(projectId),
  ]);

  const source = agentResult.source === "failure" ? "error" : agentResult.source === "empty" ? "api" : agentResult.source;
  const currentStage = Math.max(0, stages.findIndex((stage) => project.stage.includes(stage.replace("合规审查", "合规"))));
  const openTasks = tasks.data.filter((item) => item.status !== "done").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const openConsistency = consistency.data.filter((item) => item.status === "open" || item.status === "review");
  const failedChecks = packageResult.data.checks.filter((item) => item.status === "failed");
  const pendingMatches = matches.data.flatMap((item) => item.candidates).filter((item) => item.decision === "pending");
  const reviewCount = requirements.filter((item) => item.status === "review" || item.confidence < 0.7).length;
  const unresolvedRisks = disqualifications.filter((item) => item.status !== "resolved" && item.status !== "waived");
  const activeRisks = unresolvedRisks.slice(0, 4);
  const now = source === "demo" ? DEMO_NOW : new Date();
  const finalBlockers = failedChecks.length + openTasks.length;

  const workflowRows: WorkflowRow[] = [
    { id: "requirements", title: "复核招标要求", detail: "逐条确认要求、原文与强制性", status: reviewCount > 0 ? "需人工复核" : "已完成", tone: reviewCount > 0 ? "warning" : "ready", pending: `${reviewCount} 项`, href: `/projects/${projectId}/requirements` },
    { id: "evidence", title: "证据匹配", detail: "确认企业材料与要求的对应关系", status: pendingMatches.length > 0 ? "需处理" : "已完成", tone: pendingMatches.length > 0 ? "warning" : "ready", pending: `${pendingMatches.length} 项`, href: `/projects/${projectId}/evidence-matching` },
    { id: "consistency", title: "一致性检查", detail: "检查金额、主体、日期和承诺", status: openConsistency.length > 0 ? "存在冲突" : "已完成", tone: openConsistency.length > 0 ? "critical" : "ready", pending: `${openConsistency.length} 项`, href: `/projects/${projectId}/consistency` },
    { id: "responses", title: "标书编制", detail: "根据已确认要求编制响应内容", status: "可进入", tone: "neutral", pending: `${requirements.filter((item) => item.status === "met").length} 项已满足`, href: `/projects/${projectId}/responses` },
    { id: "tasks", title: "整改交付", detail: "处理责任人、截止时间与阻塞", status: openTasks.length > 0 ? "需处理" : "已完成", tone: openTasks.length > 0 ? "warning" : "ready", pending: `${openTasks.length} 项`, href: `/projects/${projectId}/tasks` },
    { id: "package", title: "文件封装", detail: "校验目录、文件和交付规则", status: failedChecks.length > 0 ? "存在阻塞" : "可封装", tone: failedChecks.length > 0 ? "critical" : "ready", pending: `${failedChecks.length} 项`, href: `/projects/${projectId}/package` },
    { id: "review", title: "最终复核", detail: "人工确认交付包和审计记录", status: finalBlockers > 0 ? "尚未就绪" : "可复核", tone: finalBlockers > 0 ? "warning" : "ready", pending: `${finalBlockers} 个阻塞`, href: `/projects/${projectId}/review` },
  ];

  const workflowColumns: DataTableColumn<WorkflowRow>[] = [
    {
      key: "workflow",
      header: "工作环节",
      render: (row) => <Link className={styles.primaryCell} href={row.href}><strong>{row.title}</strong><small>{row.detail}</small></Link>,
    },
    { key: "status", header: "状态", render: (row) => <span className={`${styles.state} ${row.tone === "neutral" ? "" : styles[row.tone]}`}>{row.status}</span> },
    { key: "pending", header: "待处理", render: (row) => <span className={styles.date}>{row.pending}</span> },
    { key: "action", header: <span className="sr-only">操作</span>, render: (row) => <Link className={styles.rowAction} href={row.href}>打开</Link> },
  ];

  const riskColumns: DataTableColumn<(typeof activeRisks)[number]>[] = [
    { key: "risk", header: "风险", render: (item) => <RiskBadge level={item.status === "candidate" ? "high" : "fatal"} /> },
    { key: "item", header: "问题", render: (item) => <span className={styles.primaryCell}><strong>{item.title}</strong><small>{item.source} · 第 {item.page} 页</small></span> },
    { key: "owner", header: "负责人", render: (item) => item.owner },
    { key: "due", header: "截止", render: (item) => <time className={styles.date}>{item.dueDate}</time> },
  ];

  return (
    <div className={`page ${styles.page}`}>
      <header className={`page-header ${styles.header}`}>
        <div className={styles.titleGroup}>
          <span className={styles.projectCode}>{project.projectCode}</span>
          <h1>{project.name}</h1>
          <p>{project.buyerName} · <span className={`data-source ${source}`}>{agentResult.source === "empty" ? "API 数据 · Agent 尚未运行" : source === "api" ? "API 聚合" : source === "demo" ? "确定性演示" : "Agent API 失败"}</span></p>
        </div>
        <div className={styles.headerActions}>
          <Link className="button" href={`/agent?project=${projectId}`}><Bot size={14} />打开 Agent</Link>
          <Link className="button primary" href={`/projects/${projectId}/requirements`}>复核招标要求</Link>
        </div>
      </header>

      {agentResult.source === "failure" && <div className="mutation-feedback error" role="alert"><AlertOctagon size={16} /><span><strong>Agent 聚合失败</strong><small>{agentResult.error.message} 未自动切换为演示结果。</small></span></div>}

      <section className={styles.phase} aria-label="项目阶段">
        <div className={styles.phaseHeading}>
          <span><strong>当前阶段：{project.stage}</strong><small>{reviewCount} 项要求仍需人工复核</small></span>
          <span>整体完成度 <strong>{project.progress}%</strong></span>
        </div>
        <ol className={styles.phaseSteps}>
          {stages.map((stage, index) => (
            <li key={stage} className={index < currentStage ? styles.done : index === currentStage ? styles.current : ""}>
              <span>{index < currentStage ? <Check size={12} /> : index + 1}</span>
              <strong>{stage}</strong>
              <small>{index < currentStage ? "已完成" : index === currentStage ? "进行中" : "待开始"}</small>
            </li>
          ))}
        </ol>
      </section>

      <nav className={styles.summary} aria-label="项目状态摘要">
        <SummaryItem label="全部要求" value={requirements.length} href={`/projects/${projectId}/requirements`} />
        <SummaryItem label="否决风险" value={unresolvedRisks.length} href={`/projects/${projectId}/disqualifications`} />
        <SummaryItem label="待确认匹配" value={pendingMatches.length} href={`/projects/${projectId}/evidence-matching`} />
        <SummaryItem label="一致性问题" value={openConsistency.length} href={`/projects/${projectId}/consistency`} />
        <SummaryItem label="未完成任务" value={openTasks.length} href={`/projects/${projectId}/tasks`} />
        <SummaryItem label="封装阻塞" value={failedChecks.length} href={`/projects/${projectId}/package`} />
      </nav>

      <div className={styles.workspace}>
        <main className={styles.primary}>
          <section className={styles.section}>
            <SectionHeader title="当前工作" description="按投标交付顺序进入对应工作台" />
            <DataTable caption="项目工作流" data={workflowRows} columns={workflowColumns} keyExtractor={(row) => row.id} />
          </section>

          <div className={styles.documentSection}>
            <DocumentAnalysisPanel
              projectId={projectId}
              initialDocuments={documents}
              emptyState={source === "demo" ? "当前为确定性演示结果，未附带原始上传文件；要求、证据和审计数据来自固定演示 fixtures。" : "当前项目还没有上传文档。"}
            />
          </div>

          <section className={styles.section}>
            <SectionHeader title="最高优先级风险" description="未解决的否决候选与规则命中" action="查看全部" href={`/projects/${projectId}/disqualifications`} />
            <DataTable caption="最高优先级风险" data={activeRisks} columns={riskColumns} keyExtractor={(item) => item.id} emptyState="当前没有未解决风险" />
          </section>
        </main>

        <aside className={styles.rail} aria-label="项目状态侧栏">
          <section className={styles.section}>
            <SectionHeader title="关键时间" description="以投标截止时间为准" />
            <div className={styles.countdown}>
              <span>距离投标截止</span>
              <strong>{formatDeadlineRemaining(project.deadline, now)}</strong>
              <small>{project.deadline} · Asia/Shanghai</small>
            </div>
          </section>

          <section className={styles.section}>
            <SectionHeader title="待处理任务" description="按截止时间排序" action="查看全部" href={`/projects/${projectId}/tasks`} />
            <ol className={styles.taskList}>
              {openTasks.slice(0, 4).map((task) => (
                <li className={styles.taskItem} key={task.id}>
                  <span className={`${styles.priority} ${styles[task.priority]}`}>{priorityLabel(task.priority)}</span>
                  <span><strong>{task.title}</strong><small>{task.owner}</small></span>
                  <time>{task.dueDate.slice(5)}</time>
                </li>
              ))}
              {openTasks.length === 0 && <li className={styles.muted}>当前没有未完成任务。</li>}
            </ol>
          </section>

          <section className={styles.section}>
            <SectionHeader title="最近活动" description="追加式审计记录" action="项目记录" href={`/projects/${projectId}/audit`} />
            <ol className={styles.activityList}>
              {audit.data.slice(0, 5).map((item) => (
                <li className={styles.activityItem} key={item.id}>
                  <span className={styles.actor}>{item.actorType === "human" ? "人工" : item.actorType === "agent" ? "Agent" : "规则"}</span>
                  <span><strong>{item.action}</strong><small>{item.actor}</small></span>
                  <time>{item.timestamp.slice(11, 16)}</time>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, href }: { label: string; value: number; href: string }) {
  return <Link className={styles.summaryItem} href={href}><span>{label}</span><strong>{value}</strong></Link>;
}

function SectionHeader({ title, description, action, href }: { title: string; description: string; action?: string; href?: string }) {
  return <div className={styles.sectionHeader}><div><h2>{title}</h2><p>{description}</p></div>{action && href ? <Link href={href}>{action}</Link> : null}</div>;
}

function priorityLabel(priority: "critical" | "high" | "medium" | "low") {
  return priority === "critical" ? "阻断" : priority === "high" ? "高" : priority === "medium" ? "普通" : "低";
}
