import { DEMO_PROJECT_ID, projects, requirements } from "@/lib/demo/data";
import { packageChecks, remediationTasks } from "@/lib/phase-data/demo";
import type { Project } from "@/lib/types";

export const DEMO_NOW = new Date("2026-07-16T15:30:00+08:00");
export type ProductDataSource = "api" | "demo" | "error";

export interface ProjectContext {
  id: string;
  project: Project | null;
  name: string;
  code: string;
  stage: string;
  deadline: string;
  deadlineLabel: string;
  fatalRiskCount: number;
  taskCount: number;
  packageBlockers: number;
  source: ProductDataSource;
  sourceLabel: string;
}

export function projectIdFromPath(pathname: string) {
  if (pathname === "/projects/new") return null;
  return pathname.match(/^\/projects\/([^/]+)(?:\/|$)/)?.[1] ?? null;
}

export function formatDeadlineRemaining(deadline: string, now = DEMO_NOW) {
  const parsed = new Date(deadline.replace(" ", "T") + "+08:00");
  if (Number.isNaN(parsed.getTime())) return "截止时间待同步";
  const milliseconds = parsed.getTime() - now.getTime();
  if (milliseconds <= 0) return "已截止";
  const hours = Math.floor(milliseconds / 3_600_000);
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

/**
 * The synchronous context exists solely for the explicitly enabled demo.
 * Production project context must be loaded from the local API instead.
 */
export function getProjectContext(pathname: string, demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"): ProjectContext | null {
  const id = projectIdFromPath(pathname);
  if (!id) return null;
  if (!demoMode) return { id, project: null, name: "项目数据加载中", code: "API PENDING", stage: "等待本地 API", deadline: "待同步", deadlineLabel: "截止时间待同步", fatalRiskCount: 0, taskCount: 0, packageBlockers: 0, source: "error", sourceLabel: "等待 API 聚合 · 未回退演示" };
  const project = projects.find((item) => item.id === id) ?? null;
  if (!project) return { id, project: null, name: `项目 ${id.slice(0, 8)}`, code: "未同步编号", stage: "数据不可用", deadline: "待同步", deadlineLabel: "截止时间不可用", fatalRiskCount: 0, taskCount: 0, packageBlockers: 0, source: "error", sourceLabel: "项目聚合失败" };
  const isPrimaryDemo = id === DEMO_PROJECT_ID;
  return {
    id,
    project,
    name: project.name,
    code: project.projectCode,
    stage: project.stage,
    deadline: project.deadline,
    deadlineLabel: formatDeadlineRemaining(project.deadline),
    fatalRiskCount: isPrimaryDemo ? requirements.filter((item) => item.risk === "fatal" && item.status !== "met").length : project.risk === "fatal" ? project.highRiskCount : 0,
    taskCount: isPrimaryDemo ? remediationTasks.filter((item) => item.status !== "done").length : project.taskCount,
    packageBlockers: isPrimaryDemo ? packageChecks.filter((item) => item.status === "failed").length : 0,
    source: "demo",
    sourceLabel: "确定性演示 · 项目清单聚合",
  };
}

export const globalRoutes = { dashboard: "/dashboard", projects: "/projects", evidence: "/evidence", tasks: "/tasks", agent: "/agent", audit: "/audit" } as const;
