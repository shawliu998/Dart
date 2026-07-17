import { ResponseWorkbench } from "@/features/responses/response-workbench";
import { responseApi } from "@/lib/api/responses";

export default async function ResponsesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await responseApi.list(projectId);
  return <ResponseWorkbench projectId={projectId} initialResponses={result.data} source={result.source} loadError={result.error} />;
}
