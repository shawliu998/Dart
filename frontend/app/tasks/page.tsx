import { phaseApi } from "@/lib/api/phase2";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { TaskCenter } from "@/features/tasks/task-center";

export default async function GlobalTasksPage() {
  const result = await phaseApi.tasks(DEMO_PROJECT_ID);
  return <TaskCenter projectId={DEMO_PROJECT_ID} initialTasks={result.data} source={result.source} loadError={result.error} />;
}
