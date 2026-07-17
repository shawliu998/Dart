import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { agentApi } from "@/lib/api/agent";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { resolveAgentProjectId } from "@/lib/agent";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ project?: string | string[] }> }) {
  const query = await searchParams;
  const projectId = resolveAgentProjectId(query.project, DEMO_PROJECT_ID);
  const result = await agentApi.getRun(projectId);
  return <AgentWorkspace initialResult={result} projectId={projectId} />;
}
