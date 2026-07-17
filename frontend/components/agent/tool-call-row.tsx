import { Clock3, Database, ShieldAlert, Wrench } from "lucide-react";
import type { AgentStep } from "@/lib/agent";
import { SourceReference } from "./source-reference";

function durationLabel(step: AgentStep) {
  if (!step.startedAt) return "未开始";
  if (!step.finishedAt) return "进行中";
  const started = Date.parse(step.startedAt.replace(" ", "T"));
  const finished = Date.parse(step.finishedAt.replace(" ", "T"));
  if (Number.isNaN(started) || Number.isNaN(finished)) return "已记录";
  const minutes = Math.max(1, Math.round((finished - started) / 60_000));
  return `${minutes} 分钟`;
}

export function ToolCallRow({ step }: { step: AgentStep }) {
  const needsHuman = step.approvalIds.length > 0;
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600"><Wrench aria-hidden="true" size={14} /></span><div className="min-w-0"><h3 className="truncate text-xs font-semibold text-slate-900">{step.title}</h3><p className="mt-0.5 truncate text-[11px] text-slate-500">{step.tool ?? "受控业务服务"}</p></div></div>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500"><Clock3 aria-hidden="true" size={11} />{durationLabel(step)}</span>
      </header>
      <dl className="mt-3 grid gap-2 text-[11px]">
        <div className="rounded-md bg-slate-50 p-2"><dt className="font-semibold text-slate-700">输入</dt><dd className="mt-1 leading-4 text-slate-600">{step.description}</dd></div>
        <div className="rounded-md bg-slate-50 p-2"><dt className="font-semibold text-slate-700">输出</dt><dd className="mt-1 leading-4 text-slate-600">{step.message}</dd></div>
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-slate-600"><Database aria-hidden="true" size={11} />{step.outputIds.length} 项输出</span>
        {needsHuman && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-900"><ShieldAlert aria-hidden="true" size={11} />需要人工 · {step.approvalIds.length} 项</span>}
      </div>
      {step.sources?.[0] && <div className="mt-2"><SourceReference source={step.sources[0]} compact /></div>}
    </article>
  );
}
