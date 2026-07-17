"use client";

import { useEffect, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import { apiRequest, isRemoteApiConfigured } from "@/lib/api/client";
import { mapProjectDto } from "@/lib/api/projects";
import type { AgentRunBundle } from "@/lib/agent";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { formatDeadlineRemaining, getProjectContext, projectIdFromPath, type ProductDataSource, type ProjectContext } from "@/lib/product-context";

interface ShellContextState { status: "loading" | "ready" | "error"; context: ProjectContext | null; agent: AgentRunBundle | null; source: ProductDataSource; error: string | null; }

export function useShellProductContext(pathname: string): ShellContextState {
  const [state, setState] = useState<ShellContextState>(() => ({ status: isRemoteApiConfigured ? "loading" : "ready", context: getProjectContext(pathname), agent: null, source: isRemoteApiConfigured ? "api" : "demo", error: null }));
  useEffect(() => {
    let live = true;
    const pathProjectId = projectIdFromPath(pathname);
    const agentProjectId = pathProjectId ?? DEMO_PROJECT_ID;
    if (!isRemoteApiConfigured) {
      const agentResult = agentApi.getDemoRun(agentProjectId);
      queueMicrotask(() => { if (live) setState({ status: "ready", context: getProjectContext(pathname), agent: agentResult.data, source: "demo", error: null }); });
      return () => { live = false; };
    }
    void Promise.all([
      pathProjectId ? apiRequest<Record<string, unknown>>(`/api/projects/${pathProjectId}`).then((dto) => mapProjectDto(dto)) : Promise.resolve(null),
      agentApi.getRun(agentProjectId),
    ]).then(([project, agentResult]) => {
      if (!live) return;
      if (agentResult.source === "failure") throw new Error(agentResult.error.message);
      const context: ProjectContext | null = pathProjectId && project ? {
        id: pathProjectId, project, name: project.name, code: project.projectCode, stage: project.stage, deadline: project.deadline,
        deadlineLabel: formatDeadlineRemaining(project.deadline, new Date()),
        fatalRiskCount: agentResult.data.approvals.filter((item) => item.status === "pending" && item.risk === "fatal").length,
        taskCount: agentResult.data.outputs.find((item) => item.kind === "task")?.count ?? 0,
        packageBlockers: agentResult.data.outputs.find((item) => item.kind === "package")?.count ?? 0,
        source: "api", sourceLabel: `API 聚合 · ${agentResult.data.run.updatedAt}`,
      } : null;
      setState({ status: "ready", context, agent: agentResult.data, source: "api", error: null });
    }).catch((error) => { if (live) setState({ status: "error", context: pathProjectId ? { id: pathProjectId, project: null, name: "项目数据不可用", code: "API ERROR", stage: "聚合失败", deadline: "不可用", deadlineLabel: "截止时间不可用", fatalRiskCount: 0, taskCount: 0, packageBlockers: 0, source: "error", sourceLabel: "API 聚合失败 · 未回退演示" } : null, agent: null, source: "error", error: error instanceof Error ? error.message : "未知聚合错误" }); });
    return () => { live = false; };
  }, [pathname]);
  return state;
}
