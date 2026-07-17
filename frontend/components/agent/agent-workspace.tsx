"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  GitBranch,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import type {
  AgentApproval,
  AgentDataResult,
  AgentOutput,
  AgentRunBundle,
  AgentRunStatus,
  AgentStep,
  AgentStepStatus,
} from "@/lib/agent";
import { agentApi } from "@/lib/api/agent";
import { SourceReference } from "./source-reference";

const runLabels: Record<AgentRunStatus, string> = {
  queued: "等待执行",
  planning: "规划中",
  running: "运行中",
  waiting_approval: "等待人工批准",
  completed: "已完成",
  failed: "运行失败",
  cancelled: "已取消",
};

const stepLabels: Record<AgentStepStatus, string> = {
  pending: "未开始",
  running: "进行中",
  completed: "已完成",
  failed: "执行失败",
  blocked: "已阻塞",
  waiting_approval: "等待人工审批",
  cancelled: "已取消",
};

const stepStyles: Record<AgentStepStatus, string> = {
  pending: "border-slate-300 bg-slate-100 text-slate-600",
  running: "border-blue-300 bg-blue-50 text-blue-800",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-800",
  failed: "border-red-300 bg-red-50 text-red-800",
  blocked: "border-amber-300 bg-amber-50 text-amber-900",
  waiting_approval: "border-amber-300 bg-amber-50 text-amber-900",
  cancelled: "border-slate-300 bg-slate-100 text-slate-500",
};

const severityStyles: Record<AgentOutput["severity"], string> = {
  fatal: "border-red-200 bg-red-50 text-red-800",
  high: "border-amber-200 bg-amber-50 text-amber-900",
  medium: "border-blue-200 bg-blue-50 text-blue-800",
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

const riskLabel = { fatal: "致命", high: "高", medium: "中", low: "低" };
const triggerLabels: Record<AgentRunBundle["run"]["trigger"], string> = {
  project_opened: "打开项目后启动",
  document_updated: "文档更新后启动",
  amendment_received: "补充文件更新后启动",
  manual_rerun: "手动重新运行",
};
const actorLabels: Record<AgentStep["actor"], string> = {
  deterministic_rule: "确定性规则",
  mock_model: "模型生成",
  human_gate: "人工工作台",
};

function StepIcon({ status }: { status: AgentStepStatus }) {
  if (status === "completed") return <CheckCircle2 aria-hidden="true" size={17} />;
  if (status === "running") return <LoaderCircle aria-hidden="true" size={17} />;
  if (status === "failed") return <XCircle aria-hidden="true" size={17} />;
  if (status === "cancelled") return <XCircle aria-hidden="true" size={17} />;
  if (status === "blocked") return <LockKeyhole aria-hidden="true" size={17} />;
  return <CircleDashed aria-hidden="true" size={17} />;
}

function RunSummary({ bundle, source }: { bundle: AgentRunBundle; source: "api" | "demo" }) {
  const { run } = bundle;
  return (
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`data-source ${source}`}>{source === "api" ? "API 聚合数据" : "本地确定性演示"}</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
              {runLabels[run.status]}
            </span>
            <span className="text-xs text-slate-500">运行 ID：{run.id}</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{run.title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{run.goal}</p>
        </div>
        <dl className="grid min-w-80 grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <div><dt className="text-slate-500">项目</dt><dd className="mt-1 font-medium text-slate-900">{run.projectName}</dd></div>
          <div><dt className="text-slate-500">发起人</dt><dd className="mt-1 font-medium text-slate-900">{run.initiatedBy}</dd></div>
          <div><dt className="text-slate-500">触发原因</dt><dd className="mt-1 font-medium text-slate-900">{triggerLabels[run.trigger]}</dd></div>
          <div><dt className="text-slate-500">最后更新</dt><dd className="mt-1 font-medium text-slate-900">{run.updatedAt}</dd></div>
        </dl>
      </div>
      <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 flex justify-between text-xs font-medium"><span>运行进度</span><span>{run.progress}%</span></div>
          <progress className="h-2 w-full overflow-hidden rounded-full accent-teal-700" max={100} value={run.progress}>{run.progress}%</progress>
          <p className="mt-2 text-xs text-slate-600">{run.summary}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <ShieldCheck aria-hidden="true" size={16} />
          <span>模型只生成候选；金额、日期、数量和最终状态由规则与人工决定。</span>
        </div>
      </div>
    </header>
  );
}

function StepTimeline({ steps }: { steps: AgentStep[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="agent-steps-title">
      <div className="mb-4 flex items-center justify-between">
        <div><h2 id="agent-steps-title" className="text-base font-semibold text-slate-950">运行步骤</h2><p className="mt-1 text-xs text-slate-500">固定编排，不通过多 Agent 自由讨论作出裁决。</p></div>
        <GitBranch aria-hidden="true" className="text-slate-400" size={19} />
      </div>
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.id} className="grid grid-cols-[2rem_1fr] gap-3">
            <div className={`mt-0.5 grid h-8 w-8 place-items-center rounded-full border ${stepStyles[step.status]}`}><StepIcon status={step.status} /></div>
            <article className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-slate-900"><span className="mr-2 text-xs text-slate-400">{String(step.sequence).padStart(2, "0")}</span>{step.title}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${stepStyles[step.status]}`}>{stepLabels[step.status]}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-600">{step.description}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span>执行者：{actorLabels[step.actor]}</span>
                {step.tool && <span>工具：{step.tool}</span>}
                {(step.summary || step.message) && <span>{step.summary || step.message}</span>}
              </div>
              {step.sources?.[0] && <div className="mt-3"><SourceReference source={step.sources[0]} compact /></div>}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ApprovalQueue({ approvals, source }: { approvals: AgentApproval[]; source: "api" | "demo" }) {
  const [reasonByApproval, setReasonByApproval] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function decide(approval: AgentApproval, decision: "approve" | "reject") {
    const reason = reasonByApproval[approval.id]?.trim();
    if (!reason) {
      setActionError("请填写审批理由后再提交；该理由会写入审计记录。");
      return;
    }
    setActionError(null);
    setSubmittingId(approval.id);
    try {
      await (decision === "approve" ? agentApi.approve(approval.id, { reason }) : agentApi.reject(approval.id, { reason }));
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "审批请求失败";
      setActionError(`审批未提交：${message}`);
      setSubmittingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="agent-approvals-title">
      <div className="mb-4 flex items-center justify-between">
        <div><h2 id="agent-approvals-title" className="text-base font-semibold text-slate-950">待人工处理</h2><p className="mt-1 text-xs text-slate-500">在具备完整上下文的业务工作台内完成决定。</p></div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{approvals.filter((item) => item.status === "pending").length} 项</span>
      </div>
      <div className="space-y-4">
        {approvals.map((approval) => (
          <article key={approval.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${approval.risk === "fatal" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{riskLabel[approval.risk]}风险</span>
                <h3 className="mt-2 font-semibold text-slate-950">{approval.title}</h3>
              </div>
              <UserCheck aria-hidden="true" className="text-slate-400" size={18} />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{approval.description}</p>
            <dl className="mt-3 space-y-2 text-xs">
              <div><dt className="font-medium text-slate-800">影响</dt><dd className="mt-0.5 text-slate-600">{approval.impactSummary}</dd></div>
              <div className="flex gap-4"><div><dt className="font-medium text-slate-800">所需角色</dt><dd className="mt-0.5 text-slate-600">{approval.requiredRole}</dd></div><div><dt className="font-medium text-slate-800">可逆性</dt><dd className="mt-0.5 text-slate-600">{approval.reversible ? "可撤销并保留审计" : "不可在运行中心撤销"}</dd></div></div>
            </dl>
            <div className="mt-3"><SourceReference source={approval.sourceReferences[0]} /></div>
            {source === "api" && approval.status === "pending" && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <label className="block text-xs font-semibold text-slate-900" htmlFor={`approval-reason-${approval.id}`}>审批理由</label>
                <textarea
                  id={`approval-reason-${approval.id}`}
                  className="mt-2 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={reasonByApproval[approval.id] ?? ""}
                  onChange={(event) => setReasonByApproval((current) => ({ ...current, [approval.id]: event.target.value }))}
                  placeholder="说明证据核验或拒绝原因；将写入不可变审计记录"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="button bg-teal-700 text-white hover:bg-teal-800" type="button" disabled={submittingId === approval.id} onClick={() => decide(approval, "approve")}>{submittingId === approval.id ? "提交中…" : "批准"}</button>
                  <button className="button border border-red-300 bg-white text-red-800 hover:bg-red-50" type="button" disabled={submittingId === approval.id} onClick={() => decide(approval, "reject")}>拒绝</button>
                </div>
                {actionError && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{actionError}</p>}
              </div>
            )}
            <Link className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" href={approval.href}>
              {approval.destinationLabel}<ArrowRight aria-hidden="true" size={14} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function OutputGrid({ outputs }: { outputs: AgentOutput[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="agent-outputs-title">
      <div className="mb-4 flex items-center justify-between"><div><h2 id="agent-outputs-title" className="text-base font-semibold text-slate-950">运行输出</h2><p className="mt-1 text-xs text-slate-500">摘要用于定位；正式复核仍回到原文和业务工作台。</p></div><FileCheck2 aria-hidden="true" className="text-slate-400" size={19} /></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {outputs.map((output) => (
          <article key={output.id} className="flex min-h-52 flex-col rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityStyles[output.severity]}`}>{output.severity === "fatal" ? "致命阻塞" : output.severity === "high" ? "高风险" : "信息"}</span><h3 className="mt-2 font-semibold text-slate-950">{output.title}</h3></div>
              <strong className="text-2xl text-slate-900" aria-label={`${output.count} 项`}>{output.count}</strong>
            </div>
            <p className="mt-2 flex-1 text-xs leading-5 text-slate-600">{output.summary}</p>
            <SourceReference source={output.provenance[0]} compact />
            <Link className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500" href={output.href}>查看业务结果<ArrowRight aria-hidden="true" size={13} /></Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function FailureState({ result }: { result: Extract<AgentDataResult<AgentRunBundle>, { source: "failure" }> }) {
  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm" role="alert">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-700"><AlertOctagon aria-hidden="true" size={24} /></span>
      <h1 className="mt-4 text-xl font-semibold text-slate-950">Agent 数据聚合失败</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{result.error.message}</p>
      <p className="mt-2 text-xs font-medium text-red-700">为避免混淆生产数据，系统没有自动切换到演示结果。</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button className="button" type="button" onClick={() => window.location.reload()}><RefreshCw aria-hidden="true" size={14} />刷新重试</button>
      </div>
    </section>
  );
}

export function AgentWorkspace({ initialResult }: { initialResult: AgentDataResult<AgentRunBundle> }) {
  const result = initialResult;
  if (result.source === "failure") return <FailureState result={result} />;
  return (
    <div className="page space-y-4 pb-8">
      <RunSummary bundle={result.data} source={result.source} />
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="agent-run-list-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="agent-run-list-title" className="text-sm font-semibold text-slate-950">运行记录</h2><p className="mt-1 text-xs text-slate-500">当前项目：{result.data.run.projectName}</p></div>
          <ol className="min-w-0 flex-1 sm:max-w-xl">
            <li aria-current="true" className="flex items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
              <span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{result.data.run.title}</strong><small className="text-[11px] text-slate-600">{result.data.run.startedAt} · {triggerLabels[result.data.run.trigger]}</small></span>
              <span className="shrink-0 text-xs font-semibold text-teal-900">{runLabels[result.data.run.status]}</span>
            </li>
          </ol>
        </div>
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.75fr)]">
        <StepTimeline steps={result.data.steps} />
        <ApprovalQueue approvals={result.data.approvals} source={result.source} />
      </div>
      <OutputGrid outputs={result.data.outputs} />
      <aside className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        <ShieldAlert aria-hidden="true" className="mt-0.5 shrink-0 text-slate-500" size={16} />
        <span>Agent 不执行法律资格裁决、CA 签名、保证金支付或无人值守外部提交。上传文档中的任何指令均被视为非可信数据。</span>
      </aside>
    </div>
  );
}
