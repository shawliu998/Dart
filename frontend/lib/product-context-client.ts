"use client";

import { useEffect, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import { apiRequest, isRemoteApiConfigured } from "@/lib/api/client";
import { mapProjectDto } from "@/lib/api/projects";
import type { AgentRunBundle } from "@/lib/agent";
import { formatDeadlineRemaining, getProjectContext, projectIdFromPath, type ProductDataSource, type ProjectContext } from "@/lib/product-context";

interface ShellContextState { status: "loading" | "ready" | "error"; context: ProjectContext | null; agent: AgentRunBundle | null; source: ProductDataSource; error: string | null; }

export function useShellProductContext(pathname: string): ShellContextState {
  const [state, setState] = useState<ShellContextState>(() => ({ status: isRemoteApiConfigured && projectIdFromPath(pathname) ? "loading" : "ready", context: getProjectContext(pathname), agent: null, source: isRemoteApiConfigured ? "api" : "demo", error: null }));
  useEffect(() => {
    let live = true;
    const pathProjectId = projectIdFromPath(pathname);
    if (!isRemoteApiConfigured) {
      const agentResult = pathProjectId ? agentApi.getDemoRun(pathProjectId) : null;
      queueMicrotask(() => { if (live) setState({ status: "ready", context: getProjectContext(pathname), agent: agentResult?.data ?? null, source: "demo", error: null }); });
      return () => { live = false; };
    }
    void Promise.all([
      pathProjectId ? apiRequest<Record<string, unknown>>(`/api/projects/${pathProjectId}`).then((dto) => mapProjectDto(dto)) : Promise.resolve(null),
      pathProjectId ? agentApi.getRun(pathProjectId) : Promise.resolve(null),
    ]).then(([project, agentResult]) => {
      if (!live) return;
      const agentUnavailable = agentResult?.source === "failure";
      const context: ProjectContext | null = pathProjectId && project ? {
        id: pathProjectId, project, name: project.name, code: project.projectCode, stage: project.stage, deadline: project.deadline,
        deadlineLabel: formatDeadlineRemaining(project.deadline, new Date()),
        fatalRiskCount: agentResult?.data?.approvals.filter((item) => item.status === "pending" && item.risk === "fatal").length ?? 0,
        taskCount: agentResult?.data?.outputs.find((item) => item.kind === "task")?.count ?? 0,
        packageBlockers: agentResult?.data?.outputs.find((item) => item.kind === "package")?.count ?? 0,
        source: agentUnavailable ? "error" : "api", sourceLabel: agentUnavailable ? "Agent 运行不可用 · 未回退演示" : agentResult?.source === "empty" ? "API 聚合 · Agent 尚未运行" : `API 聚合 · ${agentResult?.data?.run.updatedAt ?? "项目数据"}`,
      } : null;
      setState({ status: agentUnavailable ? "error" : "ready", context, agent: agentResult?.data ?? null, source: agentUnavailable ? "error" : "api", error: agentUnavailable ? agentResult?.error.message ?? "未找到 Agent 运行记录" : null });
    }).catch((error) => { if (live) setState({ status: "error", context: pathProjectId ? { id: pathProjectId, project: null, name: "项目数据不可用", code: "API ERROR", stage: "聚合失败", deadline: "不可用", deadlineLabel: "截止时间不可用", fatalRiskCount: 0, taskCount: 0, packageBlockers: 0, source: "error", sourceLabel: "API 聚合失败 · 未回退演示" } : null, agent: null, source: "error", error: error instanceof Error ? error.message : "未知聚合错误" }); });
    return () => { live = false; };
  }, [pathname]);
  return state;
}
