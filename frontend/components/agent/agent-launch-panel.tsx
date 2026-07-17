"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, RefreshCw } from "lucide-react";

import { agentApi } from "@/lib/api/agent";

export function AgentLaunchPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start(): Promise<void> {
    setStarting(true);
    setMessage(null);
    const result = await agentApi.createRun(projectId);
    setStarting(false);
    if (result.source === "failure") {
      setMessage(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50 p-4" aria-label="项目分析操作">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-slate-950"><Bot size={18} />项目分析 Agent</h1>
          <p className="mt-1 text-xs leading-5 text-slate-700">固定执行文件校验、解析、要求候选提取，并在人工复核处暂停；不会作出最终合规或法律结论。</p>
        </div>
        <button className="button primary" type="button" disabled={starting} onClick={() => void start()}>
          {starting ? <><LoaderCircle className="spin" size={15} />正在创建运行</> : <><RefreshCw size={15} />发起项目分析</>}
        </button>
      </div>
      {message && <p className="mt-3 text-xs font-medium text-red-800" role="alert">{message}</p>}
    </section>
  );
}
