import { phaseApi } from "@/lib/api/phase2";
import { AmendmentWorkbench } from "@/features/amendments/amendment-workbench";

export default async function AmendmentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await phaseApi.amendments(projectId);
  return <AmendmentWorkbench projectId={projectId} initialAmendments={result.data} source={result.source} />;
}
