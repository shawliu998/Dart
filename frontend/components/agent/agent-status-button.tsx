"use client";

import { Bot, ChevronRight } from "lucide-react";
import type { AgentRun, AgentRunStatus } from "@/lib/agent";

const labels: Record<AgentRunStatus, string> = { queued: "等待", planning: "规划中", running: "运行中", waiting_approval: "待审批", completed: "已完成", failed: "失败", cancelled: "已取消" };

export function AgentStatusButton({ run, pendingApprovalCount, onClick }: { run: AgentRun; pendingApprovalCount: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`打开 Agent 运行详情，当前${labels[run.status]}，${pendingApprovalCount}项待审批`}
      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-left text-xs text-slate-700 shadow-sm hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      onClick={onClick}
    >
      <span className="relative grid h-6 w-6 place-items-center rounded-md bg-teal-50 text-teal-800"><Bot aria-hidden="true" size={14} />{pendingApprovalCount > 0 && <i className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber-600 px-1 text-[11px] not-italic text-white">{pendingApprovalCount}</i>}</span>
      <span className="hidden sm:grid"><strong className="font-semibold">Agent {labels[run.status]}</strong><small className="text-[11px] text-slate-500">{run.progress}% · {pendingApprovalCount} 项待审批</small></span>
      <ChevronRight aria-hidden="true" size={13} />
    </button>
  );
}
