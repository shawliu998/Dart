import { projectApi } from "@/lib/api/projects";
import { ProjectList } from "@/features/projects/project-list";

export default async function ProjectsPage() {
  const projects = await projectApi.list();
  return <ProjectList initialProjects={projects} />;
}
