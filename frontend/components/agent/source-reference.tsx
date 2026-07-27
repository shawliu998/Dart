import { FileText, ShieldCheck } from "lucide-react";
import type { AgentSourceRef } from "@/lib/agent";

const reviewLabels: Record<AgentSourceRef["reviewState"], string> = {
  verified: "已核验来源",
  manual_review: "待人工复核",
  rule_result: "确定性规则",
};

export function SourceReference({ source, compact = false }: { source: AgentSourceRef | null | undefined; compact?: boolean }) {
  if (!source) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        当前输出暂未绑定可展示来源
      </div>
    );
  }
  const confidence = source.confidence === null ? null : `${Math.round(source.confidence * 100)}% 置信度`;
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
        {source.reviewState === "rule_result" ? <ShieldCheck aria-hidden="true" size={14} /> : <FileText aria-hidden="true" size={14} />}
        <span>{source.document}</span>
        <span aria-label={source.page ? `第 ${source.page} 页` : "无页码"}>{source.page ? `第 ${source.page} 页` : "规则来源"}</span>
        <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">{reviewLabels[source.reviewState]}</span>
        {confidence && <span>{confidence}</span>}
      </div>
      {!compact && <p className="mt-2 line-clamp-3 leading-5 text-slate-600">“{source.excerpt}”</p>}
    </div>
  );
}
