import { AlertTriangle, CheckCircle2, Database, LoaderCircle, RotateCcw, XCircle } from "lucide-react";

/** Shared mutation contract. A demo success is always a warning because it is not persisted. */
export interface MutationResult {
  persisted: boolean;
  source: "api" | "demo";
  status: "success" | "warning" | "error";
  title: string;
  message: string;
  auditEventId?: string;
}

export type AsyncOperationState =
  | { status: "idle" }
  | { status: "loading"; title?: string; message?: string };

export function MutationFeedback({ result, operation = { status: "idle" }, onRetry }: { result?: MutationResult | null; operation?: AsyncOperationState; onRetry?: () => void }) {
  if (operation.status === "idle" && !result) return null;
  if (operation.status === "loading") return <div className="mutation-feedback loading" role="status"><LoaderCircle className="spin" size={16} /><span><strong>{operation.title ?? "正在处理"}</strong><small>{operation.message ?? "请稍候，结果将在完成后标明数据来源与持久化状态。"}</small></span></div>;
  if (!result) return null;
  const Icon = result.status === "success" ? CheckCircle2 : result.status === "error" ? XCircle : AlertTriangle;
  return <div className={`mutation-feedback ${result.status}`} role={result.status === "error" ? "alert" : "status"}><Icon size={16} /><span><strong>{result.title}</strong><small>{result.message}</small><em><Database size={12} />{result.persisted ? "已写入 API" : "未写入后端"} · {result.source === "api" ? "API 数据" : "确定性演示"}{result.auditEventId ? ` · 审计 ${result.auditEventId}` : ""}</em></span>{result.status === "error" && onRetry && <button type="button" onClick={onRetry}><RotateCcw size={13} />重试</button>}</div>;
}
