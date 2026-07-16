import { projectApi } from "@/lib/api/projects";
import { RequirementsWorkbench } from "@/features/requirements/requirements-workbench";

export default async function RequirementsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const requirements = await projectApi.requirements(projectId);
  return <RequirementsWorkbench initialRequirements={requirements} />;
}
