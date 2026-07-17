import { FinalReview } from "@/features/review/final-review";
import { agentApi } from "@/lib/api/agent";
import { phaseApi } from "@/lib/api/phase2";
import { projectApi } from "@/lib/api/projects";
import { responseApi } from "@/lib/api/responses";

export default async function ProjectFinalReviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [requirements, disqualifications, matches, tasks, responses, packageResult, agentResult] = await Promise.allSettled([
    projectApi.requirements(projectId), projectApi.disqualifications(projectId), phaseApi.evidenceMatches(projectId), phaseApi.tasks(projectId), responseApi.list(projectId), phaseApi.package(projectId), agentApi.getRun(projectId),
  ]);
  const errors: string[] = [];
  const failed = (label: string, result: PromiseSettledResult<unknown>) => { if (result.status === "rejected") errors.push(`${label}：${result.reason instanceof Error ? result.reason.message : "请求失败"}`); };
  failed("招标要求", requirements); failed("否决风险", disqualifications); failed("证据匹配", matches); failed("整改任务", tasks); failed("投标响应", responses); failed("文件封装", packageResult); failed("Agent 运行", agentResult);
  const value = <T,>(result: PromiseSettledResult<T>, fallback: T): T => result.status === "fulfilled" ? result.value : fallback;
  const matchResult = value(matches, { data: [], source: "api" as const });
  const taskResult = value(tasks, { data: [], source: "api" as const });
  const responseResult = value(responses, { data: [], source: "api" as const });
  const packageData = value(packageResult, { data: { tree: [], checks: [] }, source: "api" as const });
  if (matchResult.error) errors.push(`证据匹配：${matchResult.error}`);
  if (taskResult.error) errors.push(`整改任务：${taskResult.error}`);
  if (responseResult.error) errors.push(`投标响应：${responseResult.error}`);
  if (packageData.error) errors.push(`文件封装：${packageData.error}`);
  const fallbackAgent = { source: "failure" as const, data: null, error: { code: "agent_run_request_failed" as const, message: "Agent 运行数据不可用。", retryable: true } };
  const resolvedAgent = value(agentResult, fallbackAgent);
  if (resolvedAgent.source === "failure") errors.push(`Agent 运行：${resolvedAgent.error.message}`);
  return <FinalReview projectId={projectId} data={{ requirements: value(requirements, []), disqualifications: value(disqualifications, []), matches: matchResult.data, tasks: taskResult.data, responses: responseResult.data, packageTree: packageData.data.tree }} agentResult={resolvedAgent} errors={[...new Set(errors)]} />;
}
