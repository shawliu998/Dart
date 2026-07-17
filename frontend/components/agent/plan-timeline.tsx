import { CheckCircle2, CircleDashed, LoaderCircle, LockKeyhole, XCircle } from "lucide-react";
import type { AgentStep, AgentStepStatus } from "@/lib/agent";

const labels: Record<AgentStepStatus, string> = { pending: "未开始", running: "进行中", completed: "已完成", failed: "失败", blocked: "已阻塞" };
const styles: Record<AgentStepStatus, string> = {
  pending: "border-slate-300 bg-slate-50 text-slate-500",
  running: "border-blue-300 bg-blue-50 text-blue-700",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-700",
  failed: "border-red-300 bg-red-50 text-red-700",
  blocked: "border-amber-300 bg-amber-50 text-amber-800",
};

function Icon({ status }: { status: AgentStepStatus }) {
  if (status === "completed") return <CheckCircle2 aria-hidden="true" size={15} />;
  if (status === "running") return <LoaderCircle aria-hidden="true" size={15} />;
  if (status === "blocked") return <LockKeyhole aria-hidden="true" size={15} />;
  if (status === "failed") return <XCircle aria-hidden="true" size={15} />;
  return <CircleDashed aria-hidden="true" size={15} />;
}

export function PlanTimeline({ steps }: { steps: AgentStep[] }) {
  return (
    <ol className="space-y-2" aria-label="Agent 执行计划">
      {steps.map((step) => (
        <li key={step.id} className="grid grid-cols-[1.75rem_1fr] gap-2">
          <span className={`grid h-7 w-7 place-items-center rounded-full border ${styles[step.status]}`}><Icon status={step.status} /></span>
          <div className="rounded-md border border-slate-200 bg-white p-2.5">
            <div className="flex items-center justify-between gap-2"><strong className="text-xs text-slate-900">{step.sequence}. {step.title}</strong><span className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${styles[step.status]}`}>{labels[step.status]}</span></div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{step.message}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
