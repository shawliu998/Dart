"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Bot, FileSearch, ListChecks, ShieldCheck, Wrench, X } from "lucide-react";
import type { AgentRunBundle } from "@/lib/agent";
import { PlanTimeline } from "./plan-timeline";
import { SourceReference } from "./source-reference";
import { ToolCallRow } from "./tool-call-row";

type DrawerTab = "goal" | "plan" | "tools" | "approvals" | "findings";
const tabs: { id: DrawerTab; label: string }[] = [
  { id: "goal", label: "目标" },
  { id: "plan", label: "计划" },
  { id: "tools", label: "工具调用" },
  { id: "approvals", label: "待审批" },
  { id: "findings", label: "本次发现" },
];

export function AgentRunDrawer({ open, onClose, bundle, source }: { open: boolean; onClose: () => void; bundle: AgentRunBundle; source: "api" | "demo" }) {
  const [tab, setTab] = useState<DrawerTab>("plan");
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  if (!open || typeof document === "undefined") return null;

  const pendingApprovals = bundle.approvals.filter((item) => item.status === "pending");
  return createPortal(
    <div className="agent-run-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="agent-run-drawer-shell" role="dialog" aria-modal="true" aria-labelledby="agent-drawer-title">
        <header className="border-b border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-800"><Bot aria-hidden="true" size={18} /></span><div><div className="flex flex-wrap items-center gap-2"><h2 id="agent-drawer-title" className="font-semibold text-slate-950">Agent 运行详情</h2><span className={`data-source ${source}`}>{source === "api" ? "API" : "本地演示"}</span></div><p className="mt-1 text-xs text-slate-500">{bundle.run.projectName} · {bundle.run.updatedAt}</p></div></div>
            <button autoFocus type="button" className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="关闭 Agent 运行详情" onClick={onClose}><X aria-hidden="true" size={17} /></button>
          </div>
          <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Agent 运行详情分类">
            {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${tab === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => setTab(item.id)}>{item.label}{item.id === "approvals" && pendingApprovals.length > 0 ? ` ${pendingApprovals.length}` : ""}</button>)}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "goal" && <section className="space-y-3"><div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck aria-hidden="true" size={15} />运行目标</h3><p className="mt-2 text-xs leading-5 text-slate-600">{bundle.run.goal}</p></div><dl className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 text-xs"><div><dt className="text-slate-500">发起人</dt><dd className="mt-1 font-medium">{bundle.run.initiatedBy}</dd></div><div><dt className="text-slate-500">运行进度</dt><dd className="mt-1 font-medium">{bundle.run.progress}%</dd></div><div><dt className="text-slate-500">Prompt</dt><dd className="mt-1 font-medium">{bundle.run.promptVersion}</dd></div><div><dt className="text-slate-500">策略</dt><dd className="mt-1 font-medium">{bundle.run.policyVersion}</dd></div></dl><p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">模型只提供候选和解释；最终合规结果、金额、日期和数量由规则与人工确认。</p></section>}
          {tab === "plan" && <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><ListChecks aria-hidden="true" size={15} />确定性执行计划</h3><PlanTimeline steps={bundle.steps} /></section>}
          {tab === "tools" && <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Wrench aria-hidden="true" size={15} />业务工具调用</h3><div className="space-y-3">{bundle.steps.map((step) => <ToolCallRow key={step.id} step={step} />)}</div></section>}
          {tab === "approvals" && <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck aria-hidden="true" size={15} />待人工审批</h3><div className="space-y-3">{pendingApprovals.map((approval) => <article key={approval.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><h4 className="text-xs font-semibold text-slate-900">{approval.title}</h4><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{approval.type}</span></div><p className="mt-2 text-[11px] leading-4 text-slate-600">{approval.impactSummary}</p><p className="mt-2 text-[11px] text-slate-500">角色：{approval.requiredRole} · {approval.reversible ? "可逆" : "不可在此撤销"}</p><div className="mt-2"><SourceReference source={approval.sourceReferences[0]} compact /></div><Link className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:underline" href={approval.href} onClick={onClose}>{approval.destinationLabel}<ArrowRight aria-hidden="true" size={12} /></Link></article>)}</div></section>}
          {tab === "findings" && <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><FileSearch aria-hidden="true" size={15} />本次发现与输出</h3><div className="space-y-3">{bundle.outputs.map((output) => <article key={output.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><h4 className="text-xs font-semibold text-slate-900">{output.title}</h4><strong className="text-lg text-slate-900">{output.count}</strong></div><p className="mt-1 text-[11px] leading-4 text-slate-600">{output.summary}</p><div className="mt-2"><SourceReference source={output.provenance[0]} compact /></div><Link className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:underline" href={output.href} onClick={onClose}>打开业务结果<ArrowRight aria-hidden="true" size={12} /></Link></article>)}</div></section>}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
