import { agentApi } from "@/lib/api/agent";
import { phaseApi } from "@/lib/api/phase2";
import { projectApi } from "@/lib/api/projects";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { DEMO_NOW } from "@/lib/product-context";

export async function getDashboardData() {
  const [projects, taskResult, auditResult, agentResult] = await Promise.all([projectApi.list(), phaseApi.tasks(DEMO_PROJECT_ID), phaseApi.audit(DEMO_PROJECT_ID), agentApi.getRun(DEMO_PROJECT_ID)]);
  const agent = agentResult.data;
  const now = DEMO_NOW.getTime();
  const cutoff = now + 14 * 24 * 60 * 60 * 1000;
  const dueToday = taskResult.data.filter((task) => task.status !== "done" && new Date(`${task.dueDate}T23:59:59+08:00`).toDateString() === DEMO_NOW.toDateString()).length;
  const nearestProject = [...projects].filter((project) => !Number.isNaN(new Date(project.deadline.replace(" ", "T") + "+08:00").getTime())).sort((a, b) => a.deadline.localeCompare(b.deadline))[0] ?? null;
  const source = agentResult.source === "failure" ? "error" as const : taskResult.source === "api" && auditResult.source === "api" && agentResult.source === "api" ? "api" as const : "demo" as const;
  return {
    projects, tasks: taskResult.data, audit: auditResult.data, source, agent, agentError: agentResult.error,
    nowLabel: new Intl.DateTimeFormat("zh-CN", { dateStyle: "full", timeZone: "Asia/Shanghai" }).format(DEMO_NOW),
    sourceLabel: source === "api" ? "API 聚合" : source === "error" ? "Agent API 聚合失败" : "确定性演示聚合",
    metrics: {
      activeProjects: projects.length,
      stageCount: new Set(projects.map((project) => project.stage)).size,
      dueSoon: projects.filter((project) => { const due = new Date(project.deadline.replace(" ", "T") + "+08:00").getTime(); return due >= now && due <= cutoff; }).length,
      nearestDeadline: nearestProject?.deadline ?? "无可用截止时间",
      fatalRisks: projects.reduce((sum, project) => sum + (project.risk === "fatal" ? project.highRiskCount : 0), 0),
      openTasks: taskResult.data.filter((task) => task.status !== "done").length,
      dueToday,
      pendingApprovals: agent?.approvals.filter((approval) => approval.status === "pending").length ?? 0,
      packageBlockers: agent?.outputs.find((output) => output.kind === "package")?.count ?? 0,
    },
  };
}
