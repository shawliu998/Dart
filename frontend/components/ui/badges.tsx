import { AlertTriangle, CheckCircle2, CircleHelp, Eye, XCircle } from "lucide-react";
import type { RequirementStatus, RiskLevel } from "@/lib/types";

const riskMap: Record<RiskLevel, string> = {
  fatal: "否决风险",
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

const statusMap: Record<RequirementStatus, { label: string; icon: typeof CheckCircle2 }> = {
  met: { label: "已满足", icon: CheckCircle2 },
  missing: { label: "缺少证据", icon: CircleHelp },
  review: { label: "人工复核", icon: Eye },
  failed: { label: "不满足", icon: XCircle },
  conflict: { label: "存在冲突", icon: AlertTriangle },
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`badge risk-${level}`}>{riskMap[level]}</span>;
}

export function StatusBadge({ status }: { status: RequirementStatus }) {
  const { label, icon: Icon } = statusMap[status];
  return <span className={`badge status-${status}`}><Icon size={13} aria-hidden="true" />{label}</span>;
}

export function ConfidenceIndicator({ value }: { value: number }) {
  const percentage = Math.round(value * 100);
  const state = value < 0.7 ? "low" : value < 0.85 ? "medium" : "high";
  return (
    <span className={`confidence confidence-${state}`} aria-label={`置信度 ${percentage}%`}>
      <span className="confidence-track"><span style={{ width: `${percentage}%` }} /></span>
      <span>{percentage}%{state === "low" ? " · 需复核" : ""}</span>
    </span>
  );
}
