import type { Project } from "@/lib/types";
import { DEMO_NOW } from "@/lib/product-context";

export const projectViewKeys = ["active", "review", "due", "high-risk"] as const;
export type ProjectView = (typeof projectViewKeys)[number];

const projectViewLabels: Record<ProjectView, string> = {
  active: "进行中",
  review: "待处理",
  due: "7 天内截止",
  "high-risk": "高风险",
};

export function normalizeProjectView(value: string | null): ProjectView {
  return projectViewKeys.includes(value as ProjectView) ? value as ProjectView : "active";
}

export function projectViewHref(view: ProjectView): string {
  return view === "active" ? "/projects" : `/projects?view=${view}`;
}

export function isDueSoon(project: Project, now: Date = DEMO_NOW): boolean {
  const due = new Date(project.deadline.replace(" ", "T") + "+08:00").getTime();
  return due >= now.getTime() && due <= now.getTime() + 7 * 86_400_000;
}

export function isProjectInView(project: Project, view: ProjectView, now: Date = DEMO_NOW): boolean {
  switch (view) {
    case "review":
      return project.highRiskCount > 0 || project.taskCount > 0;
    case "due":
      return isDueSoon(project, now);
    case "high-risk":
      return project.risk === "fatal" || project.risk === "high";
    case "active":
    default:
      return true;
  }
}

export function getProjectViews(projects: Project[], now: Date = DEMO_NOW): Array<{ key: ProjectView; label: string; count: number }> {
  return projectViewKeys.map((key) => ({
    key,
    label: projectViewLabels[key],
    count: projects.filter((project) => isProjectInView(project, key, now)).length,
  }));
}
