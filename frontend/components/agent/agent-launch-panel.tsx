"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, RefreshCw } from "lucide-react";

import { agentApi } from "@/lib/api/agent";
import type { AgentMode } from "@/lib/agent";

export function AgentLaunchPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [goal, setGoal] = useState("完成投标文件分析、证据匹配与响应草稿，提交最终统一复核。");
  const [mode, setMode] = useState<AgentMode>("autonomous_draft");
  const [maxIterations, setMaxIterations] = useState("20");

  async function start(): Promise<void> {
    setStarting(true);
    setMessage(null);
    const result = await agentApi.createRun(projectId, { goal, mode, maxIterations: Math.min(100, Math.max(1, Number(maxIterations) || 1)) });
    setStarting(false);
    if (result.source === "failure") {
      setMessage(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50 p-4" aria-label="项目分析操作">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-slate-950"><Bot size={18} />项目分析 Agent</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700">自主草稿模式会按项目状态选择下一项受控工具，生成内部草稿并仅在最终工作包复核处暂停；不会作出最终合规或法律结论。</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_9rem_auto] md:items-end">
        <label className="block text-xs font-semibold text-slate-800" htmlFor="agent-goal">目标
          <textarea id="agent-goal" className="mt-1 min-h-20 w-full rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={goal} onChange={(event) => setGoal(event.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-slate-800" htmlFor="agent-mode">运行模式
          <select id="agent-mode" className="mt-1 min-h-10 w-full rounded-md border border-teal-200 bg-white px-3 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={mode} onChange={(event) => setMode(event.target.value as AgentMode)}>
            <option value="autonomous_draft">自主草稿</option>
            <option value="supervised">监督执行</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-800" htmlFor="agent-max-iterations">最大迭代次数
          <input id="agent-max-iterations" className="mt-1 min-h-10 w-full rounded-md border border-teal-200 bg-white px-3 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" type="number" min={1} max={100} value={maxIterations} onChange={(event) => setMaxIterations(event.target.value)} />
        </label>
        <button className="button primary" type="button" disabled={starting} onClick={() => void start()}>
          {starting ? <><LoaderCircle className="spin" size={15} />正在创建运行</> : <><RefreshCw size={15} />发起项目分析</>}
        </button>
      </div>
      {message && <p className="mt-3 text-xs font-medium text-red-800" role="alert">{message}</p>}
    </section>
  );
}
