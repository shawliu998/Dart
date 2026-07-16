import { phaseApi } from "@/lib/api/phase2";
import { TaskCenter } from "@/features/tasks/task-center";

export default async function TasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await phaseApi.tasks(projectId);
  return <TaskCenter projectId={projectId} initialTasks={result.data} source={result.source} />;
}
