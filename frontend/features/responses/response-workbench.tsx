"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertOctagon, CheckCircle2, ChevronRight, FileText, Keyboard, Save, Search, ShieldCheck, X } from "lucide-react";
import { DataUnavailableState } from "@/components/feedback/data-unavailable-state";
import { MutationFeedback, type MutationResult } from "@/components/feedback/mutation-feedback";
import type { DataSource } from "@/lib/phase-data/types";
import { responseApi, type TenderResponse } from "@/lib/api/responses";

const statusLabels: Record<TenderResponse["status"], string> = { not_started: "未开始", drafted: "草稿待编辑", needs_review: "待人工复核", missing_evidence: "缺少材料", approved: "已批准", excluded: "不适用" };
const statusOptions: Array<{ value: "all" | TenderResponse["status"]; label: string }> = [{ value: "all", label: "全部状态" }, ...Object.entries(statusLabels).map(([value, label]) => ({ value: value as TenderResponse["status"], label }))];
type WorkbenchPanel = "items" | "canvas" | "sources";

export function ResponseWorkbench({ projectId, initialResponses, source, loadError }: { projectId: string; initialResponses: TenderResponse[]; source: DataSource; loadError?: string }) {
  const [items, setItems] = useState(initialResponses);
  const [selectedId, setSelectedId] = useState(initialResponses[0]?.id);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(initialResponses.map((item) => [item.id, contentOf(item)])));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TenderResponse["status"]>("all");
  const [reason, setReason] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [activePanel, setActivePanel] = useState<WorkbenchPanel>("canvas");
  const [working, setWorking] = useState<"save" | "approve" | null>(null);
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const filtered = useMemo(() => items.filter((item) => matchesFilters(item, query, statusFilter)), [items, query, statusFilter]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const choose = useCallback((item: TenderResponse) => { setSelectedId(item.id); setReason(""); setFeedback(null); setActivePanel("canvas"); }, []);
  const moveSelection = useCallback((delta: number) => {
    if (!filtered.length) return;
    const currentIndex = Math.max(0, filtered.findIndex((item) => item.id === selectedId));
    choose(filtered[(currentIndex + delta + filtered.length) % filtered.length]);
  }, [choose, filtered, selectedId]);

  function updateFilters(nextQuery: string, nextStatus: "all" | TenderResponse["status"]) {
    const nextItems = items.filter((item) => matchesFilters(item, nextQuery, nextStatus));
    setQuery(nextQuery);
    setStatusFilter(nextStatus);
    if (nextItems.length && !nextItems.some((item) => item.id === selectedId)) {
      setSelectedId(nextItems[0].id);
      setReason("");
      setFeedback(null);
      setActivePanel("canvas");
    }
  }

  useEffect(() => {
    if (!reviewMode) return;
    function handleReviewKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (event.key === "Escape") { setReviewMode(false); return; }
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "j") { event.preventDefault(); moveSelection(1); }
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "k") { event.preventDefault(); moveSelection(-1); }
    }
    window.addEventListener("keydown", handleReviewKey);
    return () => window.removeEventListener("keydown", handleReviewKey);
  }, [moveSelection, reviewMode]);

  if (loadError) return <DataUnavailableState title="投标响应 API 数据不可用" message={loadError} />;
  if (!items.length) return <EmptyWorkbench projectId={projectId} />;
  const draft = selected ? drafts[selected.id] ?? contentOf(selected) : "";
  const cannotApprove = selected?.status === "missing_evidence";

  async function save() {
    if (!selected || !draft.trim() || !reason.trim()) { setFeedback(errorFeedback("保存需要填写响应内容和修改原因。")); return; }
    setWorking("save");
    try { const updated = await responseApi.save(selected.id, draft, reason); update(updated); setFeedback(successFeedback("响应草稿已保存", "修改已写入后端，并重新进入人工复核。")); }
    catch (error) { setFeedback(errorFeedback(`未保存响应：${error instanceof Error ? error.message : "未知错误"}`)); }
    finally { setWorking(null); }
  }
  async function approve() {
    if (!selected || !reason.trim()) { setFeedback(errorFeedback("批准前请填写复核意见，确保决策可追溯。")); return; }
    if (cannotApprove) { setFeedback(errorFeedback("该条响应尚有缺少材料，补齐并保存后才可批准。")); return; }
    setWorking("approve");
    try { const updated = await responseApi.approve(selected.id, reason); update(updated); setFeedback(successFeedback("响应已批准", "人工批准已写入后端审计，可用于后续导出。")); }
    catch (error) { setFeedback(errorFeedback(`未批准响应：${error instanceof Error ? error.message : "未知错误"}`)); }
    finally { setWorking(null); }
  }
  function update(updated: TenderResponse) { setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); setDrafts((current) => ({ ...current, [updated.id]: contentOf(updated) })); }

  return <div className="page response-page">
    <header className="page-header"><div className="page-title-group"><span className="project-code">标书编制</span><h1>投标响应工作台</h1><p>项目 {projectId} · <span className={`data-source ${source}`}>{source === "api" ? "API 数据" : "确定性演示"}</span> · 逐节核对要求、来源和已接受证据。</p></div><div className="response-summary"><span><strong>{items.length}</strong> 条响应</span><span><strong>{items.filter((item) => item.status === "approved").length}</strong> 已批准</span><span className="warning"><strong>{items.filter((item) => item.status === "missing_evidence").length}</strong> 待补材料</span></div></header>
    <MutationFeedback result={feedback} operation={working ? { status: "loading", title: working === "save" ? "正在保存响应" : "正在批准响应" } : undefined} />
    <nav className="response-panel-tabs" aria-label="工作台面板"><button type="button" aria-pressed={activePanel === "items"} className={activePanel === "items" ? "active" : ""} onClick={() => setActivePanel("items")}>大纲</button><button type="button" aria-pressed={activePanel === "canvas"} className={activePanel === "canvas" ? "active" : ""} onClick={() => setActivePanel("canvas")}>正文</button><button type="button" aria-pressed={activePanel === "sources"} className={activePanel === "sources" ? "active" : ""} onClick={() => setActivePanel("sources")}>依据</button></nav>
    <div className={`response-layout response-show-${activePanel}`}>
      <ResponseList items={filtered} selectedId={selected?.id} query={query} statusFilter={statusFilter} reviewMode={reviewMode} onQuery={(value) => updateFilters(value, statusFilter)} onStatus={(value) => updateFilters(query, value)} onClear={() => updateFilters("", "all")} onChoose={choose} onReview={() => setReviewMode((current) => !current)} />
      {selected ? <section className="panel response-editor"><div className="panel-header response-canvas-head"><div><span className="response-requirement-code">{selected.requirement?.code || "未关联编号"}</span><h2>{selected.requirement?.title || selected.strategy}</h2><p>当前版本 {selected.version} · {selected.requirement?.category || "响应草稿"} · 置信度 {selected.confidence === null ? "待确认" : `${Math.round(selected.confidence * 100)}%`}</p></div><span className={`response-status ${selected.status}`}>{statusLabels[selected.status]}</span></div><div className="response-editor-body">{selected.missingInformation.length > 0 && <aside className="response-missing"><AlertOctagon size={16} /><span><strong>{cannotApprove ? "尚缺材料，补充后再复核" : "仍有待人工补充内容"}</strong><small>{selected.missingInformation.join("；")}</small></span></aside>}<section className="response-strategy"><h3>响应策略</h3><p>{selected.strategy}</p></section><label className="response-draft"><span>投标响应正文</span><textarea value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [selected.id]: event.target.value }))} aria-label="投标响应内容" /></label><label className="response-reason"><span>修改／复核意见（必填）</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：已核对营业执照和项目经理证书原件" /></label></div><footer className="response-actions"><small><ShieldCheck size={14} /> 仅已批准响应可进入导出产物。</small><span /><button className="button" type="button" disabled={working !== null} onClick={save}><Save size={15} />保存并复核</button><button className="button primary" type="button" disabled={working !== null || selected.status === "approved" || cannotApprove} onClick={approve}><CheckCircle2 size={15} />{selected.status === "approved" ? "已批准" : "批准响应"}</button></footer></section> : <FilteredPanel title="没有可编辑的匹配条目" />}
      {selected ? <ResponseSources item={selected} cannotApprove={cannotApprove} onReview={() => setActivePanel("canvas")} /> : <FilteredSources />}
    </div>
  </div>;
}

function ResponseList({ items, selectedId, query, statusFilter, reviewMode, onQuery, onStatus, onClear, onChoose, onReview }: { items: TenderResponse[]; selectedId?: string; query: string; statusFilter: "all" | TenderResponse["status"]; reviewMode: boolean; onQuery: (value: string) => void; onStatus: (value: "all" | TenderResponse["status"]) => void; onClear: () => void; onChoose: (item: TenderResponse) => void; onReview: () => void }) {
  return <section className="panel response-list">
    <div className="panel-header"><div><h2>投标大纲</h2><p>按要求逐节复核</p></div><button className={`response-review-toggle${reviewMode ? " active" : ""}`} type="button" aria-pressed={reviewMode} onClick={onReview}><Keyboard size={14} />复核模式</button></div>
    {reviewMode && <div className="response-review-hint" role="status"><strong>键盘复核已开启</strong><span>↓ / J 下一条　↑ / K 上一条　Esc 退出</span></div>}
    <div className="response-filters"><label className="response-search"><Search size={14} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="检索要求、正文或缺少材料" aria-label="检索响应条目" /></label><select value={statusFilter} onChange={(event) => onStatus(event.target.value as "all" | TenderResponse["status"])} aria-label="响应状态筛选">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    <div className="response-list-items">{items.length ? items.map((item) => {
      const acceptedCount = item.evidenceSources ? item.evidenceSources.length : item.evidenceClaimIds.length;
      return <button type="button" key={item.id} onClick={() => onChoose(item)} className={item.id === selectedId ? "selected" : ""} aria-pressed={item.id === selectedId}><span className={`response-status ${item.status}`}>{statusLabels[item.status]}</span><strong>{item.requirement?.title || item.strategy}</strong><small>{item.requirement?.code ? `${item.requirement.code} · ` : ""}{item.missingInformation.length ? `待补：${item.missingInformation.join("；")}` : `${acceptedCount} 条已接受证据`}</small><ChevronRight size={14} /></button>;
    }) : <div className="response-no-results"><strong>没有匹配的响应条目</strong><p>调整关键词或状态筛选后继续查看。</p>{(query || statusFilter !== "all") && <button type="button" onClick={onClear}><X size={13} />清除筛选</button>}</div>}</div>
  </section>;
}

function ResponseSources({ item, cannotApprove, onReview }: { item: TenderResponse; cannotApprove: boolean; onReview: () => void }) {
  const source = item.requirementSource;
  const evidenceSources = item.evidenceSources ?? [];
  return <aside className="panel response-sources"><header className="panel-header"><div><h2>要求与依据</h2><p>仅展示已接受的来源证据</p></div></header><div className="response-sources-body">
    <section><h3>标准化要求</h3>{item.requirement?.normalizedText ? <p className="response-source-text">{item.requirement.normalizedText}</p> : <p className="response-unknown">暂未返回标准化要求。</p>}</section>
    <section><h3>要求原文</h3>{source && <footer className="response-document-source"><FileText size={15} /><span><strong>{source.filename || "来源文件未命名"}</strong><small>{[`版本 ${source.version}`, `第 ${source.page} 页`, source.clause].filter(Boolean).join(" · ")}</small></span></footer>}{source?.excerpt ? <blockquote>{source.excerpt}</blockquote> : <p className="response-unknown">暂未返回要求原文，无法显示来源内容。</p>}</section>
    <section><h3>已接受证据</h3>{evidenceSources.length ? <div className="response-evidence-list">{evidenceSources.map((evidence) => <article key={evidence.claimId}><header><strong>{evidence.assetName || evidence.filename || "已接受证据"}</strong>{evidence.humanVerified && <span>已核验</span>}</header><p>{[evidence.subject, evidence.predicate, evidence.value].filter(Boolean).join(" ") || evidence.excerpt || "未提供证据摘要"}</p><footer>{[evidence.filename, `第 ${evidence.page} 页`, evidence.validTo && `有效至 ${evidence.validTo}`].filter(Boolean).join(" · ")}</footer></article>)}</div> : <p className="response-unknown">没有可展示的已接受证据。请先在合规矩阵中核对并接纳材料；暂定匹配不会在这里冒充已接受证据。</p>}</section>
    {item.riskNotes.length > 0 && <section className="response-risks"><h3>风险提示</h3><ul>{item.riskNotes.map((note) => <li key={note}>{note}</li>)}</ul></section>}
    {cannotApprove && <aside className="response-next-step"><strong>下一步：补齐材料</strong><p>先补充响应内容并保存进入人工复核；证据材料仍须在要求与证据中核对。</p><Link href={`/projects/${item.projectId}/requirements`}>前往要求与证据核对</Link></aside>}
    <button type="button" className="response-mobile-review" onClick={onReview}>返回正文与复核</button>
  </div></aside>;
}

function FilteredPanel({ title }: { title: string }) { return <section className="panel response-editor"><div className="response-no-results"><strong>{title}</strong><p>清除筛选或调整关键词后继续编制。</p></div></section>; }
function FilteredSources() { return <aside className="panel response-sources"><div className="response-no-results"><strong>当前没有可显示的依据</strong><p>选择一条可见响应后查看来源。</p></div></aside>; }

function EmptyWorkbench({ projectId }: { projectId: string }) { return <div className="page v4-response-empty-page"><header className="page-header"><div className="page-title-group"><span className="project-code">标书编制</span><h1>投标响应工作台</h1><p>从要求原文和已接纳证据开始，形成可供人工编辑与批准的逐节草稿。</p></div></header><section className="panel v4-response-empty"><div className="panel-header"><div><h2>尚无响应草稿</h2><p>0 条响应</p></div></div><div className="v4-response-empty-row"><div><strong>先核对投标要求与证据材料</strong><p>要求确认、来源定位和证据接纳完成后，系统才会生成可复核的响应草稿。</p></div><div className="v4-empty-actions"><Link className="button primary" href={`/projects/${projectId}/requirements`}>处理要求与证据</Link></div></div></section></div>; }
function contentOf(item: TenderResponse) { return item.editedText ?? item.draftText; }
function matchesFilters(item: TenderResponse, query: string, status: "all" | TenderResponse["status"]) { return (status === "all" || item.status === status) && `${item.requirement?.code ?? ""}${item.requirement?.title ?? ""}${item.strategy}${contentOf(item)}${item.missingInformation.join(" ")}`.toLowerCase().includes(query.toLowerCase()); }
function errorFeedback(message: string): MutationResult { return { source: "api", persisted: false, status: "error", title: "操作未完成", message }; }
function successFeedback(title: string, message: string): MutationResult { return { source: "api", persisted: true, status: "success", title, message }; }
