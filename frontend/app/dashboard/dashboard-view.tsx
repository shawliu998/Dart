"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, CalendarClock, Download, Plus, RefreshCw } from "lucide-react";
import type { AwaitedReturn } from "./types";
import styles from "./dashboard-view.module.css";
import { useFeedback } from "@/components/feedback/feedback-provider";
import { RiskBadge } from "@/components/ui/badges";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ProgressBar } from "@/components/ui/progress";

export function DashboardView({ data }: { data: AwaitedReturn }) {
  const { notify } = useFeedback();
  const [period, setPeriod] = useState("14d");
  const [refreshing, setRefreshing] = useState(false);
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const urgentTasks = data.tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);

  const projectColumns: DataTableColumn<(typeof data.projects)[number]>[] = [
    {
      key: "project",
      header: "项目",
      render: (project) => (
        <Link className={styles.primaryCell} href={`/projects/${project.id}/overview`}>
          <strong>{project.name}</strong>
          <small>{project.projectCode} · {project.buyerName}</small>
        </Link>
      ),
    },
    { key: "stage", header: "阶段", render: (project) => project.stage },
    { key: "deadline", header: "截止时间", render: (project) => <time className={styles.deadline}>{project.deadline}</time> },
    { key: "progress", header: "完成度", render: (project) => <ProgressBar value={project.progress} /> },
    { key: "risk", header: "风险", render: (project) => <RiskBadge level={project.risk} /> },
    { key: "action", header: <span className="sr-only">操作</span>, render: (project) => <Link className={styles.rowAction} href={`/projects/${project.id}/overview`}>打开</Link> },
  ];

  const taskColumns: DataTableColumn<(typeof urgentTasks)[number]>[] = [
    {
      key: "priority",
      header: "优先级",
      render: (task) => <span className={`${styles.priority} ${styles[task.priority]}`}>{priorityLabel(task.priority)}</span>,
    },
    {
      key: "task",
      header: "整改任务",
      render: (task) => (
        <Link className={styles.primaryCell} href="/tasks">
          <strong>{task.title}</strong>
          <small>{task.sourceLabel}</small>
        </Link>
      ),
    },
    { key: "owner", header: "负责人", render: (task) => task.owner },
    { key: "due", header: "截止", render: (task) => <time className={styles.deadline}>{task.dueDate}</time> },
    { key: "action", header: <span className="sr-only">操作</span>, render: () => <Link className={styles.rowAction} href="/tasks">处理</Link> },
  ];

  function refreshDashboard() {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      notify({
        title: "工作台已刷新",
        description: `已按${period === "7d" ? "近 7 天" : period === "30d" ? "近 30 天" : "近 14 天"}重新聚合当前演示数据。`,
        tone: "success",
      });
    }, 450);
  }

  function exportDashboard() {
    const rows = [
      ["项目", "项目编号", "阶段", "完成度", "风险"],
      ...data.projects.map((project) => [project.name, project.projectCode, project.stage, `${project.progress}%`, project.risk]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "标证通-项目态势.csv";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    notify({ title: "项目态势已导出", description: "CSV 文件包含当前项目阶段、完成度与风险。", tone: "success" });
  }

  return (
    <div className={`page v2-page ${styles.page}`}>
      <header className={`v2-page-header ${styles.header}`}>
        <div>
          <h1>今日投标态势</h1>
          <p>{data.nowLabel} · 项目、任务、审计与 Agent 运行汇总</p>
        </div>
        <div className={`header-actions ${styles.actions}`}>
          <span className={`data-source ${data.source}`}>{data.sourceLabel}</span>
          <label className={styles.period}>
            <span className="sr-only">统计范围</span>
            <CalendarClock size={14} />
            <select aria-label="统计范围" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="7d">近 7 天</option>
              <option value="14d">近 14 天</option>
              <option value="30d">近 30 天</option>
            </select>
          </label>
          <button className="button" type="button" disabled={refreshing} onClick={refreshDashboard}>
            <RefreshCw className={refreshing ? "is-spinning" : undefined} size={14} />{refreshing ? "刷新中" : "刷新"}
          </button>
          <button className="button" type="button" onClick={exportDashboard}><Download size={14} />导出</button>
          <Link className="button" href="/agent"><Bot size={14} />Agent 运行</Link>
          <Link className="button primary" href="/projects/new"><Plus size={14} />新建项目</Link>
        </div>
      </header>

      <nav className={styles.summary} aria-label="工作统计">
        <SummaryItem label="进行中项目" value={data.metrics.activeProjects} href="/projects" />
        <SummaryItem label="14 天内截止" value={data.metrics.dueSoon} href="/projects" />
        <SummaryItem label="否决风险" value={data.metrics.fatalRisks} href={`/projects/${data.projects[0]?.id}/disqualifications`} />
        <SummaryItem label="待处理任务" value={data.metrics.openTasks} href="/tasks" />
        <SummaryItem label="待人工审批" value={data.metrics.pendingApprovals} href="/agent" />
      </nav>

      <div className={styles.workspace}>
        <main className={styles.primary}>
          <section className={styles.section}>
            <SectionHeader title="项目组合" description="按截止时间、完成度与风险集中查看" action="管理项目" href="/projects" />
            <DataTable caption="当前项目组合" data={data.projects} columns={projectColumns} keyExtractor={(project) => project.id} />
          </section>

          <section className={styles.section}>
            <SectionHeader title="我的整改任务" description="当前用户负责或复核的未完成事项" action="任务中心" href="/tasks" />
            <DataTable caption="我的整改任务" data={urgentTasks} columns={taskColumns} keyExtractor={(task) => task.id} emptyState="当前没有未完成任务" />
          </section>
        </main>

        <aside className={styles.rail} aria-label="工作台侧栏">
          <section className={styles.section}>
            <SectionHeader title="优先处理" description="按优先级与截止时间排序" action="查看全部" href="/tasks" />
            <div className={styles.attentionList}>
              {urgentTasks.slice(0, 3).map((task) => (
                <Link key={task.id} href="/tasks" className={styles.attentionItem}>
                  <span className={`${styles.priority} ${styles[task.priority]}`}>{priorityLabel(task.priority)}</span>
                  <span><strong>{task.title}</strong><small>{task.reason}</small><em>{task.owner} · {task.dueDate}</em></span>
                </Link>
              ))}
              {urgentTasks.length === 0 && <p className={styles.muted}>当前没有未完成任务。</p>}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div><h2>Agent 运行状态</h2><p>当前项目工作流</p></div>
              <span className={styles.agentStatus}><i />{data.agent ? "运行中" : "聚合失败"}</span>
            </div>
            {data.agent ? (
              <>
                <div className={styles.agentSummary}>
                  <div><strong>{data.agent.run.title}</strong><small>{data.agent.run.summary}</small></div>
                  <span>{data.agent.run.progress}%</span>
                </div>
                <ProgressBar value={data.agent.run.progress} label="Agent 工作流完成度" />
                <dl className={styles.gates}>
                  <div><dt>人工审批</dt><dd>{data.metrics.pendingApprovals}</dd></div>
                  <div><dt>当前步骤</dt><dd>{data.agent.steps.find((step) => step.id === data.agent?.run.currentStepId)?.title ?? "等待"}</dd></div>
                  <div><dt>封装阻塞</dt><dd>{data.metrics.packageBlockers}</dd></div>
                </dl>
              </>
            ) : (
              <div className={styles.agentError}><strong>Agent API 数据不可用</strong><small>{data.agentError?.message ?? "未返回运行数据，未自动切换为演示结果。"}</small></div>
            )}
            <Link className={`button ${styles.agentLink}`} href="/agent">打开 Agent 运行中心</Link>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div><h2>最近活动</h2><p>规则、模型与人工操作</p></div>
              <button type="button" onClick={() => {
                void navigator.clipboard.writeText(`标证通今日摘要：${data.metrics.fatalRisks} 个否决风险，${data.metrics.openTasks} 个待处理任务。`);
                notify({ title: "今日摘要已复制", description: "可粘贴到内部协作工具中。", tone: "success" });
              }}>复制摘要</button>
            </div>
            <ol className={styles.activityList}>
              {data.audit.slice(0, 5).map((record) => (
                <li className={styles.activityItem} key={record.id}>
                  <span className={styles.activityType}>{record.actorType === "human" ? "人工" : record.actorType === "agent" ? "Agent" : "规则"}</span>
                  <span className={styles.primaryCell}><strong>{record.action}</strong><small>{record.actor} · {record.entityLabel}</small></span>
                  <time>{record.timestamp.slice(5, 16)}</time>
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

function SectionHeader({ title, description, action, href }: { title: string; description: string; action: string; href: string }) {
  return <div className={styles.sectionHeader}><div><h2>{title}</h2><p>{description}</p></div><Link href={href}>{action}</Link></div>;
}

function priorityLabel(priority: "critical" | "high" | "medium" | "low") {
  return priority === "critical" ? "阻断" : priority === "high" ? "高" : priority === "medium" ? "普通" : "低";
}
