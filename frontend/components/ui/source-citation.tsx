import { FileText, LocateFixed } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function SourceCitation({ document, page, clause, version, onNavigate }: { document: string; page: number; clause: string; version: string; onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <button className="citation-chip" type="button" onClick={onNavigate} title={t("打开来源并定位原文")}>
      <FileText size={14} aria-hidden="true" />
      <span><span data-preserve-language>{document}</span> · {t("第 {page} 页 · {clause}", { page, clause })}</span>
      <span className="citation-version">{version}</span>
      <LocateFixed size={13} aria-hidden="true" />
    </button>
  );
}
