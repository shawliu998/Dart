import { phaseApi } from "@/lib/api/phase2";
import { EvidenceMatchingWorkbench } from "@/features/evidence/evidence-matching-workbench";

export default async function EvidenceMatchingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await phaseApi.evidenceMatches(projectId);
  return <EvidenceMatchingWorkbench projectId={projectId} initialGroups={result.data} source={result.source} />;
}
