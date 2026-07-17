import { AlertOctagon } from "lucide-react";

/**
 * Keeps a failed remote read visibly distinct from an empty, valid result.
 * Callers deliberately receive no fallback records in this state.
 */
export function DataUnavailableState({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <div className="page">
      <section className="empty-state data-unavailable" role="alert">
        <AlertOctagon size={22} aria-hidden="true" />
        <strong>{title}</strong>
        <p>{message ?? "API 数据暂时不可用，未自动切换为演示数据。请稍后重试。"}</p>
        <small>来源：API · 当前未显示任何演示记录。</small>
      </section>
    </div>
  );
}
