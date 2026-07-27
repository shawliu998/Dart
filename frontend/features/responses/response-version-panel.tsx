"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, ClockCounterClockwise, X } from "@phosphor-icons/react";
import {
  responseApi,
  type ResponseRevision,
  type ResponseRevisionSummary,
} from "@/lib/api/responses";
import { diffResponseText } from "./response-diff";

const eventLabels: Record<ResponseRevisionSummary["eventType"], string> = {
  baseline: "初始内容",
  generated: "生成草稿",
  edited: "人工保存",
  approved: "人工批准",
};

function revisionContent(revision: ResponseRevision): string {
  return revision.editedText ?? revision.draftText ?? "";
}

function revisionLabel(revision: ResponseRevisionSummary): string {
  return `v${revision.revisionNumber} · ${eventLabels[revision.eventType]}`;
}

function timestamp(value: string): string {
  if (!value) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function ResponseVersionPanel({
  responseId,
  currentRevisionNumber,
  open,
  onClose,
}: {
  responseId: string;
  currentRevisionNumber: number;
  open: boolean;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<ResponseRevisionSummary[]>([]);
  const [details, setDetails] = useState<Record<number, ResponseRevision>>({});
  const [fromNumber, setFromNumber] = useState<number | null>(null);
  const [toNumber, setToNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await responseApi.listRevisions(responseId);
      setRevisions(rows);
      setDetails({});
      setToNumber(rows[0]?.revisionNumber ?? null);
      setFromNumber(rows[1]?.revisionNumber ?? rows[0]?.revisionNumber ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "版本记录暂时无法读取。");
    } finally {
      setLoading(false);
    }
  }, [responseId]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [currentRevisionNumber, loadHistory, open]);

  useEffect(() => {
    if (!open || revisions.length <= 1 || fromNumber === null || toNumber === null) return;
    const missing = Array.from(new Set([fromNumber, toNumber])).filter((number) => !details[number]);
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(missing.map((number) => responseApi.getRevision(responseId, number)))
      .then((rows) => {
        if (cancelled) return;
        setDetails((current) => Object.fromEntries([
          ...Object.entries(current),
          ...rows.map((row) => [row.revisionNumber, row]),
        ]));
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "版本内容暂时无法读取。");
      });
    return () => { cancelled = true; };
  }, [details, fromNumber, open, responseId, revisions.length, toNumber]);

  const from = fromNumber === null ? undefined : details[fromNumber];
  const to = toNumber === null ? undefined : details[toNumber];
  const rows = useMemo(
    () => from && to ? diffResponseText(revisionContent(from), revisionContent(to)) : [],
    [from, to],
  );
  const contentUnchanged = rows.length > 0 && rows.every((row) => row.kind === "same");
  const detailLoading = revisions.length > 1 && (!from || !to) && error === null;

  if (!open) return null;
  return <section className="response-version-panel" aria-label="响应版本历史">
    <header>
      <div><ClockCounterClockwise size={16} /><span><strong>版本历史</strong><small>不可变内容快照</small></span></div>
      <button type="button" onClick={onClose} aria-label="关闭版本历史"><X size={15} /></button>
    </header>
    {loading ? <div className="response-version-state" role="status">正在读取版本记录…</div> : error && !revisions.length ? <div className="response-version-state error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadHistory()}><ArrowClockwise size={14} />重试</button></div> : revisions.length <= 1 ? <div className="response-version-state"><strong>目前只有一个版本</strong><span>保存新的响应内容后即可进行版本对比。</span></div> : <>
      <div className="response-version-controls">
        <label><span>From</span><select aria-label="对比起始版本" value={fromNumber ?? ""} onChange={(event) => { setError(null); setFromNumber(Number(event.target.value)); }}>{revisions.map((revision) => <option key={revision.id} value={revision.revisionNumber}>{revisionLabel(revision)}</option>)}</select></label>
        <span aria-hidden="true">→</span>
        <label><span>To</span><select aria-label="对比目标版本" value={toNumber ?? ""} onChange={(event) => { setError(null); setToNumber(Number(event.target.value)); }}>{revisions.map((revision) => <option key={revision.id} value={revision.revisionNumber}>{revisionLabel(revision)}</option>)}</select></label>
      </div>
      {error && <div className="response-version-inline-error" role="alert">{error}</div>}
      {detailLoading ? <div className="response-version-state" role="status">正在读取版本内容…</div> : from && to ? <div className="response-version-comparison">
        {contentUnchanged && <div className="response-version-unchanged" role="status">
          <strong>响应内容未变化</strong>
          <span>{to.eventType === "approved" ? <>v{to.revisionNumber} · 仅记录人工批准事件</> : "所选版本的响应正文相同"}</span>
        </div>}
        <div className="response-version-column-head"><strong>{revisionLabel(from)}</strong><small>{from.createdByName ?? "未知操作人"} · {timestamp(from.createdAt)}</small></div>
        <div className="response-version-column-head"><strong>{revisionLabel(to)}</strong><small>{to.createdByName ?? "未知操作人"} · {timestamp(to.createdAt)}</small></div>
        <div className="response-version-diff">
          {rows.map((row, index) => <div className={`response-version-diff-row ${row.kind}`} key={`${row.kind}-${index}`}>
            <p>{row.before ?? <span>此版本无对应内容</span>}</p>
            <p>{row.after ?? <span>此版本无对应内容</span>}</p>
          </div>)}
        </div>
      </div> : null}
    </>}
  </section>;
}
