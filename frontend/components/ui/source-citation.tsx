import { FileText, LocateFixed } from "lucide-react";

export function SourceCitation({ document, page, clause, version, onNavigate }: { document: string; page: number; clause: string; version: string; onNavigate?: () => void }) {
  return (
    <button className="citation-chip" type="button" onClick={onNavigate} title="打开来源并定位原文">
      <FileText size={14} aria-hidden="true" />
      <span>{document} · 第 {page} 页 · {clause}</span>
      <span className="citation-version">{version}</span>
      <LocateFixed size={13} aria-hidden="true" />
    </button>
  );
}
