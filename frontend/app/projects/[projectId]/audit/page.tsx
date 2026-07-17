import { phaseApi } from "@/lib/api/phase2";
import { AuditCenter } from "@/features/audit/audit-center";

export default async function AuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await phaseApi.audit(projectId);
  return <AuditCenter projectId={projectId} initialRecords={result.data} source={result.source} loadError={result.error} />;
}
