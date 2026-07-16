import { phaseApi } from "@/lib/api/phase2";
import { ConsistencyWorkbench } from "@/features/consistency/consistency-workbench";

export default async function ConsistencyPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await phaseApi.consistency(projectId);
  return <ConsistencyWorkbench projectId={projectId} initialIssues={result.data} source={result.source} />;
}
