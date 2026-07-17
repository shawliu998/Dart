import { phaseApi } from "@/lib/api/phase2";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { AuditCenter } from "@/features/audit/audit-center";

export default async function GlobalAuditPage() {
  const result = await phaseApi.audit(DEMO_PROJECT_ID);
  return <AuditCenter projectId={DEMO_PROJECT_ID} initialRecords={result.data} source={result.source} loadError={result.error} />;
}
