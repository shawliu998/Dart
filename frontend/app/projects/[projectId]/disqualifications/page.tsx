import { projectApi } from "@/lib/api/projects";
import { DisqualificationCenter } from "@/features/disqualifications/disqualification-center";

export default async function DisqualificationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const items = await projectApi.disqualifications(projectId);
  return <DisqualificationCenter initialItems={items} />;
}
