"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CaretRight as ChevronRight,
  CheckCircle as CheckCircle2,
  FileText,
  FloppyDisk as Save,
  ClockCounterClockwise,
  Keyboard,
  MagnifyingGlass as Search,
  WarningCircle as AlertOctagon,
  X,
} from "@phosphor-icons/react";
import { DataUnavailableState } from "@/components/feedback/data-unavailable-state";
import { MutationFeedback, type MutationResult } from "@/components/feedback/mutation-feedback";
import type { DataSource } from "@/lib/phase-data/types";
import { responseApi, type TenderResponse } from "@/lib/api/responses";
import { ResponseVersionPanel } from "./response-version-panel";

const statusLabels: Record<TenderResponse["status"], string> = { not_started: "未开始", drafted: "草稿待编辑", needs_review: "待人工复核", missing_evidence: "缺少材料", approved: "已批准", excluded: "不适用" };
const conciseStatusLabels: Record<TenderResponse["status"], string> = { ...statusLabels, drafted: "草稿", needs_review: "待复核", missing_evidence: "缺材料" };
const statusOptions: Array<{ value: "all" | TenderResponse["status"]; label: string }> = [{ value: "all", label: "全部状态" }, ...Object.entries(statusLabels).map(([value, label]) => ({ value: value as TenderResponse["status"], label }))];
const categoryLabels: Record<string, string> = { qualification: "资格资质", commercial: "商务条件", technical: "技术要求", pricing: "报价要求", delivery: "交付计划", service: "服务保障", personnel: "人员要求", case: "案例业绩", legal: "法律与授权", security: "安全要求", format: "文件格式", signature: "签章要求", submission: "递交要求", other: "其他要求" };
type WorkbenchPanel = "items" | "canvas" | "sources";
type OutlineGroup = { key: string; label: string; order: number; items: TenderResponse[] };

export function ResponseWorkbench({ projectId, initialResponses, source, loadError }: { projectId: string; initialResponses: TenderResponse[]; source: DataSource; loadError?: string }) {
  const [items, setItems] = useState(initialResponses);
  const [selectedId, setSelectedId] = useState(initialResponses[0]?.id);
  const [expandedId, setExpandedId] = useState<string | undefined>(initialResponses[0]?.id);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
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
  const openGroup = useCallback((item: TenderResponse) => {
    const category = item.requirement?.category ?? "other";
    setCollapsedGroups((current) => {
      if (!current.has(category)) return current;
      const next = new Set(current);
      next.delete(category);
      return next;
    });
  }, []);
  const choose = useCallback((item: TenderResponse) => {
    setSelectedId(item.id);
    setExpandedId(item.id);
    setReason("");
    setFeedback(null);
    setActivePanel("canvas");
    openGroup(item);
  }, [openGroup]);
  const toggleEntry = useCallback((item: TenderResponse) => {
    const changedSelection = item.id !== selectedId;
    setSelectedId(item.id);
    setExpandedId((current) => current === item.id ? undefined : item.id);
    if (changedSelection) {
      setReason("");
      setFeedback(null);
    }
    setActivePanel("canvas");
    openGroup(item);
  }, [openGroup, selectedId]);
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
      setExpandedId(nextItems[0].id);
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

  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`response-entry-${selectedId}`)?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

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
    if (draftIsDirty) { setFeedback(errorFeedback("正文有未保存修改，请先保存并复核，再批准当前版本。")); return; }
    if (cannotApprove) { setFeedback(errorFeedback("该条响应尚有缺少材料，补齐并保存后才可批准。")); return; }
    setWorking("approve");
    try { const updated = await responseApi.approve(selected.id, reason); update(updated); setFeedback(successFeedback("响应已批准", "人工批准已写入后端审计，可用于后续导出。")); }
    catch (error) { setFeedback(errorFeedback(`未批准响应：${error instanceof Error ? error.message : "未知错误"}`)); }
    finally { setWorking(null); }
  }
  function update(updated: TenderResponse) { setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); setDrafts((current) => ({ ...current, [updated.id]: contentOf(updated) })); }
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const missingEvidenceCount = items.filter((item) => item.status === "missing_evidence").length;
  const needsReviewCount = items.filter((item) => item.status === "needs_review").length;
  const draftedCount = items.filter((item) => item.status === "drafted" || item.status === "not_started" || item.status === "excluded").length;
  const selectedPosition = selected ? filtered.findIndex((item) => item.id === selected.id) + 1 : 0;
  const draftIsDirty = selected ? draft !== contentOf(selected) : false;
  const categoryOrder = new Map(groupResponses(items).map((group) => [group.key, group.order]));
  const outlineGroups = groupResponses(filtered, categoryOrder);
  const selectedCategory = selected?.requirement?.category ?? "other";
  const selectedIsExpanded = Boolean(selected && expandedId === selected.id);

  function toggleSelectedAnswer() {
    if (!selected) return;
    setSelectedId(selected.id);
    setExpandedId((current) => current === selected.id ? undefined : selected.id);
    openGroup(selected);
  }

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  return <div className="page response-page" data-source-mode={source}>
    <header className="response-project-bar">
      <div className="response-project-title"><h1>投标响应工作台</h1><nav aria-label="项目响应视图"><Link href={`/projects/${projectId}/overview`}>总览</Link><span aria-current="page">响应列表</span><Link href={`/projects/${projectId}/requirements`}>要求来源</Link></nav></div>
      <div className="response-project-actions" aria-label="响应状态统计">
        <span className="response-counter approved" aria-label={`${approvedCount} 条已批准`}><strong>{approvedCount}</strong><small>已批准</small></span>
        <span className="response-counter needs_review" aria-label={`${needsReviewCount} 条待复核`}><strong>{needsReviewCount}</strong><small>待复核</small></span>
        <span className="response-counter missing_evidence" aria-label={`${missingEvidenceCount} 条缺材料`}><strong>{missingEvidenceCount}</strong><small>缺材料</small></span>
        <Link className="response-package-link" href={`/projects/${projectId}/package`}>文件封装</Link>
      </div>
    </header>
    <div className="response-progress" aria-label={`已批准 ${approvedCount} / ${items.length} 条响应`}>
      <div className="response-progress-track">
        <i className="approved" style={{ flexGrow: approvedCount }} />
        <i className="needs_review" style={{ flexGrow: needsReviewCount }} />
        <i className="missing_evidence" style={{ flexGrow: missingEvidenceCount }} />
        <i className="drafted" style={{ flexGrow: draftedCount }} />
      </div>
      <div><span>{items.length} 条响应</span><span>{approvedCount} 条已批准 · {missingEvidenceCount} 条待补材料</span></div>
    </div>
    <MutationFeedback result={feedback} operation={working ? { status: "loading", title: working === "save" ? "正在保存响应" : "正在批准响应" } : undefined} />
    <nav className="response-panel-tabs" aria-label="工作台面板"><button type="button" aria-pressed={activePanel === "items"} className={activePanel === "items" ? "active" : ""} onClick={() => setActivePanel("items")}>大纲</button><button type="button" aria-pressed={activePanel === "canvas"} className={activePanel === "canvas" ? "active" : ""} onClick={() => setActivePanel("canvas")}>正文</button><button type="button" aria-pressed={activePanel === "sources"} className={activePanel === "sources" ? "active" : ""} onClick={() => setActivePanel("sources")}>依据</button></nav>
    <div className="response-workspace-toolbar">
      <div className="response-outline-toolbar"><strong>项目大纲</strong><span>{outlineGroups.length} 个章节</span></div>
      <div className="response-entry-toolbar">
        <button className="response-answer-toggle" type="button" aria-pressed={selectedIsExpanded} disabled={!selected} onClick={toggleSelectedAnswer}><ChevronRight size={14} weight="bold" />{selectedIsExpanded ? "收起答案" : "展开当前答案"}</button>
        <button className={`response-review-toggle${reviewMode ? " active" : ""}`} type="button" aria-pressed={reviewMode} onClick={() => setReviewMode((current) => !current)}><Keyboard size={15} />复核模式</button>
        <select value={statusFilter} onChange={(event) => updateFilters(query, event.target.value as "all" | TenderResponse["status"])} aria-label="响应状态筛选">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <label className="response-search"><Search size={14} /><input value={query} onChange={(event) => updateFilters(event.target.value, statusFilter)} placeholder="检索问题与答案" aria-label="检索响应条目" /></label>
        <span className="response-visible-count">显示 {filtered.length} / {items.length} 条</span>
      </div>
    </div>
    {reviewMode && <div className="response-review-hint" role="status"><strong>键盘复核已开启</strong><span>↓ / J 下一条　↑ / K 上一条　Esc 退出</span></div>}
    <div className={`response-layout response-show-${activePanel}`}>
      <ResponseOutline groups={outlineGroups} selectedCategory={selectedCategory} onChoose={choose} />
      <section className="response-entry-pane">
        {outlineGroups.length ? outlineGroups.map((group) => <section className="response-section" key={group.key}>
          <header className="response-section-heading"><button type="button" aria-expanded={!collapsedGroups.has(group.key)} onClick={() => toggleGroup(group.key)}><div><ChevronRight size={14} weight="bold" /><h2>{group.order}.0 {group.label}</h2></div><span>{group.items.length} 条响应</span></button></header>
          {!collapsedGroups.has(group.key) && <div className="response-entries">{group.items.map((item) => {
            const isSelected = item.id === selected?.id;
            return <ResponseEntry
              key={item.id}
              item={item}
              selected={isSelected}
              expanded={isSelected && expandedId === item.id}
              draft={isSelected ? draft : contentOf(item)}
              reason={isSelected ? reason : ""}
              position={isSelected ? selectedPosition : 0}
              total={filtered.length}
              dirty={isSelected && draftIsDirty}
              cannotApprove={isSelected && cannotApprove}
              working={isSelected ? working : null}
              onChoose={() => toggleEntry(item)}
              onDraft={(value) => setDrafts((current) => ({ ...current, [item.id]: value }))}
              onReason={setReason}
              onSave={save}
              onApprove={approve}
              onReview={() => setActivePanel("canvas")}
            />;
          })}</div>}
        </section>) : <div className="response-no-results"><strong>没有匹配的响应条目</strong><p>调整关键词或状态筛选后继续查看。</p>{(query || statusFilter !== "all") && <button type="button" onClick={() => updateFilters("", "all")}><X size={13} />清除筛选</button>}</div>}
      </section>
    </div>
  </div>;
}

function ResponseOutline({ groups, selectedCategory, onChoose }: { groups: OutlineGroup[]; selectedCategory: string; onChoose: (item: TenderResponse) => void }) {
  return <aside className="response-outline" aria-label="项目大纲">
    {groups.length ? groups.map((group) => <button type="button" key={group.key} className={group.key === selectedCategory ? "selected" : ""} aria-pressed={group.key === selectedCategory} onClick={() => onChoose(group.items[0])}>
      <ChevronRight size={13} weight="bold" />
      <span><strong>{group.order}.0 {group.label}</strong><small>{group.items.length} 条响应</small></span>
    </button>) : <p>当前筛选没有可显示章节。</p>}
  </aside>;
}

function ResponseEntry({ item, selected, expanded, draft, reason, position, total, dirty, cannotApprove, working, onChoose, onDraft, onReason, onSave, onApprove, onReview }: {
  item: TenderResponse;
  selected: boolean;
  expanded: boolean;
  draft: string;
  reason: string;
  position: number;
  total: number;
  dirty: boolean;
  cannotApprove: boolean;
  working: "save" | "approve" | null;
  onDraft: (value: string) => void;
  onReason: (value: string) => void;
  onSave: () => void;
  onApprove: () => void;
  onChoose: () => void;
  onReview: () => void;
}) {
  const acceptedCount = item.evidenceSources ? item.evidenceSources.length : item.evidenceClaimIds.length;
  return <article id={`response-entry-${item.id}`} className={`response-entry ${item.status}${selected ? " selected" : ""}`}>
    <button type="button" className="response-entry-summary" onClick={onChoose} aria-expanded={expanded}>
      <span className="response-entry-code">{item.requirement?.code || "未编号"}</span>
      <strong>{item.requirement?.title || item.strategy}</strong>
      <span className={`response-entry-status ${item.status}`}>{conciseStatusLabels[item.status]}</span>
      <small>{acceptedCount ? `${acceptedCount} 条证据` : "无接纳证据"}</small>
      <ChevronRight size={14} weight="bold" />
    </button>
    {expanded && <ResponseEditor item={item} draft={draft} reason={reason} position={position} total={total} dirty={dirty} cannotApprove={cannotApprove} working={working} onDraft={onDraft} onReason={onReason} onSave={onSave} onApprove={onApprove} onReview={onReview} />}
  </article>;
}

function ResponseEditor({ item, draft, reason, position, total, dirty, cannotApprove, working, onDraft, onReason, onSave, onApprove, onReview }: {
  item: TenderResponse;
  draft: string;
  reason: string;
  position: number;
  total: number;
  dirty: boolean;
  cannotApprove: boolean;
  working: "save" | "approve" | null;
  onDraft: (value: string) => void;
  onReason: (value: string) => void;
  onSave: () => void;
  onApprove: () => void;
  onReview: () => void;
}) {
  const [versionsOpen, setVersionsOpen] = useState(false);
  const requirementTitle = item.requirement?.title || item.strategy;
  const category = item.requirement?.category ? categoryLabels[item.requirement.category] ?? item.requirement.category : "响应草稿";
  return <section className="response-entry-expanded" data-dirty={dirty}>
    <h2 className="sr-only">{requirementTitle}</h2>
    <div className="response-entry-context">
      <p><strong>标准化要求</strong><span>{item.requirement?.normalizedText || "暂未返回标准化要求。"}</span></p>
      <p><strong>编制要点</strong><span>{item.strategy}</span></p>
      <small>{category} · 第 {position} / {total} 条 · 内容 v{item.revisionNumber}</small>
    </div>
    {item.missingInformation.length > 0 && <aside className="response-missing"><AlertOctagon size={17} weight="fill" /><span><strong>{cannotApprove ? "尚缺材料，补充后再复核" : "仍有待人工补充内容"}</strong><small>{item.missingInformation.join("；")}</small></span></aside>}
    <div className="response-compose">
      <div className="response-compose-head"><strong>响应正文</strong><div><span className={dirty ? "dirty" : ""}>{dirty ? "有未保存修改" : `已保存 · v${item.revisionNumber}`}</span><button type="button" aria-expanded={versionsOpen} onClick={() => setVersionsOpen((current) => !current)}><ClockCounterClockwise size={14} />版本历史</button></div></div>
      <label className="response-draft"><span className="sr-only">投标响应正文</span><textarea value={draft} onChange={(event) => onDraft(event.target.value)} aria-label="投标响应内容" /></label>
      <ResponseVersionPanel responseId={item.id} currentRevisionNumber={item.revisionNumber} open={versionsOpen} onClose={() => setVersionsOpen(false)} />
    </div>
    <ResponseSources item={item} cannotApprove={cannotApprove} onReview={onReview} />
    <div className="response-entry-review">
      <label className="response-reason"><span className="sr-only">修改／复核意见（必填）</span><input value={reason} onChange={(event) => onReason(event.target.value)} aria-label="修改／复核意见（必填）" placeholder="复核意见（必填），例如：已核对营业执照和项目经理证书原件" /></label>
      <footer className="response-actions"><button className="button" type="button" disabled={working !== null} onClick={onSave}><Save size={15} />保存并复核</button><button className="button primary" type="button" disabled={working !== null || item.status === "approved" || cannotApprove || dirty} onClick={onApprove}><CheckCircle2 size={15} weight="fill" />{item.status === "approved" ? "已批准" : "批准响应"}</button></footer>
    </div>
  </section>;
}

function ResponseSources({ item, cannotApprove, onReview }: { item: TenderResponse; cannotApprove: boolean; onReview: () => void }) {
  const source = item.requirementSource;
  const evidenceSources = item.evidenceSources ?? [];
  return <section className="response-entry-references">
    <header><h3>要求与依据</h3><p>仅展示已接受的来源证据</p></header>
    <div className="response-reference-columns">
      <section><h4>要求来源</h4>{source && <div className="response-document-source"><FileText size={17} weight="duotone" /><span><strong>{source.filename || "来源文件未命名"}</strong><small>{[`版本 ${source.version}`, `第 ${source.page} 页`, source.clause].filter(Boolean).join(" · ")}</small></span></div>}{source?.excerpt ? <blockquote>{source.excerpt}</blockquote> : <p className="response-unknown">暂未返回要求原文，无法显示来源内容。</p>}</section>
      <section><h4>已接纳证据（{evidenceSources.length}）</h4>{evidenceSources.length ? <ol className="response-evidence-list">{evidenceSources.map((evidence, index) => <li key={evidence.claimId}><span className="response-evidence-index">[{index + 1}]</span><div><header><strong>{evidence.assetName || evidence.filename || "已接受证据"}</strong>{evidence.humanVerified && <span>已核验</span>}</header><p>{[evidence.subject, evidence.predicate, evidence.value].filter(Boolean).join(" ") || evidence.excerpt || "未提供证据摘要"}</p><footer>{[evidence.filename, `第 ${evidence.page} 页`, evidence.validTo && `有效至 ${evidence.validTo}`].filter(Boolean).join(" · ")}</footer></div></li>)}</ol> : <p className="response-unknown">没有可展示的已接受证据。请先在合规矩阵中核对并接纳材料；暂定匹配不会在这里冒充已接受证据。</p>}</section>
    </div>
    {item.riskNotes.length > 0 && <section className="response-risks"><h4>风险提示</h4><ul>{item.riskNotes.map((note) => <li key={note}>{note}</li>)}</ul></section>}
    {cannotApprove && <aside className="response-next-step"><strong>下一步：补齐材料</strong><p>先补充响应内容并保存进入人工复核；证据材料仍须在要求与证据中核对。</p><Link href={`/projects/${item.projectId}/requirements`}>前往要求与证据核对</Link></aside>}
    <button type="button" className="response-mobile-review" onClick={onReview}>返回正文与复核</button>
  </section>;
}

function EmptyWorkbench({ projectId }: { projectId: string }) { return <div className="page v4-response-empty-page"><header className="page-header response-heading"><div className="page-title-group"><h1>投标响应工作台</h1><p>从要求原文和已接纳证据开始，形成可供人工编辑与批准的逐节草稿。</p></div></header><section className="panel v4-response-empty"><div className="panel-header"><div><h2>尚无响应草稿</h2><p>0 条响应</p></div></div><div className="v4-response-empty-row"><div><strong>先核对投标要求与证据材料</strong><p>要求确认、来源定位和证据接纳完成后，系统才会生成可复核的响应草稿。</p></div><div className="v4-empty-actions"><Link className="button primary" href={`/projects/${projectId}/requirements`}>处理要求与证据</Link></div></div></section></div>; }
function groupResponses(items: TenderResponse[], order?: Map<string, number>): OutlineGroup[] {
  const groups = new Map<string, OutlineGroup>();
  items.forEach((item) => {
    const key = item.requirement?.category ?? "other";
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, label: categoryLabels[key] ?? key, order: order?.get(key) ?? groups.size + 1, items: [item] });
  });
  return Array.from(groups.values());
}

function contentOf(item: TenderResponse) { return item.editedText ?? item.draftText; }
function matchesFilters(item: TenderResponse, query: string, status: "all" | TenderResponse["status"]) { return (status === "all" || item.status === status) && `${item.requirement?.code ?? ""}${item.requirement?.title ?? ""}${item.strategy}${contentOf(item)}${item.missingInformation.join(" ")}`.toLowerCase().includes(query.toLowerCase()); }
function errorFeedback(message: string): MutationResult { return { source: "api", persisted: false, status: "error", title: "操作未完成", message }; }
function successFeedback(title: string, message: string): MutationResult { return { source: "api", persisted: true, status: "success", title, message }; }
