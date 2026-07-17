import { phaseApi } from "@/lib/api/phase2";
import { PackageCenter } from "@/features/package/package-center";

export default async function PackagePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await phaseApi.package(projectId);
  return <PackageCenter projectId={projectId} initialTree={result.data.tree} initialChecks={result.data.checks} source={result.source} loadError={result.error} />;
}
