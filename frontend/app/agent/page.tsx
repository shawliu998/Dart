import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { AgentLaunchPanel } from "@/components/agent/agent-launch-panel";
import { agentApi } from "@/lib/api/agent";
import { resolveAgentProjectId } from "@/lib/agent";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ project?: string | string[] }> }) {
  const query = await searchParams;
  const projectId = resolveAgentProjectId(query.project);
  if (!projectId) {
    return <main className="page"><section className="panel"><h1>请选择项目</h1><p>请从项目总览中启动“分析项目”，以查看该项目的真实运行记录。</p></section></main>;
  }
  const result = await agentApi.getRun(projectId);
  return <main className="space-y-4"><AgentLaunchPanel projectId={projectId} /><AgentWorkspace initialResult={result} /></main>;
}
