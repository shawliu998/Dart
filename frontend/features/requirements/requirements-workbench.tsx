"use client";

import { KeyboardEvent, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Check, ChevronDown, ChevronLeft, ChevronRight, Clipboard, FileCheck2, FileText, Filter, MessageSquareText, Minus, Plus, RotateCcw, Save, Search, ShieldCheck, Upload, X } from "lucide-react";
import { ConfidenceIndicator, RiskBadge, StatusBadge } from "@/components/ui/badges";
import { SourceCitation } from "@/components/ui/source-citation";
import type { Requirement, RequirementStatus } from "@/lib/types";

type DetailTab = "detail" | "evidence" | "judgement" | "activity";
type FilterKey = "all" | "disqualification" | "mandatory" | "missing" | "conflict" | "review";

const filterLabels: Record<FilterKey, string> = { all: "全部要求", disqualification: "否决项", mandatory: "强制条款", missing: "缺少证据", conflict: "存在冲突", review: "人工复核" };

export function RequirementsWorkbench({ initialRequirements }: { initialRequirements: Requirement[] }) {
  const [items, setItems] = useState(initialRequirements);
  const [selectedId, setSelectedId] = useState(initialRequirements[0]?.id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [tab, setTab] = useState<DetailTab>("detail");
  const [zoom, setZoom] = useState(88);
  const [documentQuery, setDocumentQuery] = useState("");
  const [flash, setFlash] = useState(0);
  const [evidenceState, setEvidenceState] = useState<"pending" | "accepted" | "rejected">("pending");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideStatus, setOverrideStatus] = useState<RequirementStatus>("met");
  const tableRef = useRef<HTMLDivElement>(null);

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const selectedIndex = items.findIndex((item) => item.id === selected?.id);
  const visibleItems = useMemo(() => items.filter((item) => {
    const textMatch = `${item.code}${item.title}${item.category}${item.originalText}`.toLowerCase().includes(query.toLowerCase());
    const filterMatch = filter === "all" || (filter === "disqualification" && item.disqualification) || (filter === "mandatory" && item.mandatory) || (filter === "missing" && item.status === "missing") || (filter === "conflict" && item.status === "conflict") || (filter === "review" && item.status === "review");
    return textMatch && filterMatch;
  }), [filter, items, query]);

  if (!selected) return null;

  function select(item: Requirement) {
    setSelectedId(item.id);
    setEvidenceState("pending");
    setFlash((value) => value + 1);
  }

  function moveSelection(direction: -1 | 1) {
    const next = Math.min(items.length - 1, Math.max(0, selectedIndex + direction));
    select(items[next]);
  }

  function rowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, item: Requirement) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(item); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); moveSelection(event.key === "ArrowDown" ? 1 : -1); }
  }

  function exportCsv() {
    const rows = [["编号", "标题", "分类", "状态", "页码", "置信度"], ...visibleItems.map((item) => [item.code, item.title, item.category, item.status, String(item.page), String(item.confidence)])];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "合规矩阵.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  function copyText() {
    void navigator.clipboard?.writeText(selected.originalText).then(() => window.alert("原文已复制到剪贴板。"));
  }

  function saveView() {
    localStorage.setItem("bidevidence.requirements.view", JSON.stringify({ filter, query }));
    window.alert("当前筛选视图已保存在本地。 ");
  }

  function submitOverride() {
    if (!overrideReason.trim()) return;
    setItems((current) => current.map((item) => item.id === selected.id ? { ...item, status: overrideStatus } : item));
    setOverrideOpen(false); setOverrideReason("");
    window.alert("本地演示状态已更新；连接后端后才会写入正式审计日志。 ");
  }

  return (
    <div className="page-workbench requirements-page">
      <header className="workbench-heading">
        <div><span className="workbench-kicker"><ShieldCheck size={13} />要求确认阶段</span><h1>招标要求工作台</h1><p>20 条要求 · 3 个否决项 · 6 条待人工确认 · 最后解析于 14:18</p></div>
        <div className="header-actions"><button className="button" type="button" onClick={saveView}><Save size={14} />保存视图</button><button className="button" type="button" onClick={exportCsv}><ArrowDownToLine size={14} />导出矩阵</button><button className="button primary" type="button" onClick={() => window.confirm("确认完成当前可见要求的本地演示复核？") && window.alert("本地演示复核进度已更新；尚未写入后端审计。") }><Check size={14} />完成本轮复核</button></div>
      </header>

      <section className="workbench-alert" role="status"><AlertTriangle size={15} /><span><strong>3 项高优先级阻塞</strong> · 报价超过最高限价、ISO 证书过期、投标函签章待确认。</span><button type="button" onClick={() => setFilter("disqualification")}>仅看否决项<ChevronRight size={13} /></button></section>

      <div className="requirements-grid">
        <section className="workbench-pane document-pane" aria-label="原始文档查看器">
          <div className="pane-title"><div><FileText size={15} /><span><strong>{selected.sourceDocument}</strong><small>{selected.sourceVersion} · 86 页 · 已解析</small></span></div><select aria-label="切换文档" value={selected.sourceDocument} onChange={() => window.alert("当前演示会根据要求来源自动切换文档。") }><option>{selected.sourceDocument}</option><option>补充公告01.pdf</option></select></div>
          <div className="document-toolbar"><label><Search size={13} /><input aria-label="在文档中搜索" value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="在文档内搜索" /></label><button type="button" aria-label="缩小" onClick={() => setZoom((value) => Math.max(60, value - 10))}><Minus size={13} /></button><span>{zoom}%</span><button type="button" aria-label="放大" onClick={() => setZoom((value) => Math.min(150, value + 10))}><Plus size={13} /></button><button type="button" aria-label="重置缩放" onClick={() => setZoom(88)}><RotateCcw size={13} /></button></div>
          <div className="document-canvas">
            <div className="paper" style={{ width: `${zoom}%` }}>
              <div className="paper-head"><span>智慧园区综合管理平台采购项目</span><span>第 {selected.page} 页</span></div>
              <p className="paper-section">{selected.clause}　{selected.category}要求</p>
              <p>投标人应仔细阅读本章所列各项要求，并在响应文件中逐项作出明确回应。所有证明材料应真实、有效并与投标主体保持一致。</p>
              <div key={flash} className="source-highlight"><span className="highlight-marker">当前条款</span><strong>{selected.title}</strong><p>{highlightQuery(selected.originalText, documentQuery)}</p><small>定位框：x 72 · y 318 · w 446 · h 92</small></div>
              <p>相关材料须装订在对应章节。未按要求提供的，评审委员会将依据招标文件和适用规则进行审查。</p>
              <p className="paper-foot">— {selected.sourceDocument} / {selected.sourceVersion} —</p>
            </div>
          </div>
          <div className="document-footer"><button type="button" disabled={selectedIndex === 0} onClick={() => moveSelection(-1)}><ChevronLeft size={13} />上一条</button><span><strong>第 {selected.page} 页</strong> / 共 86 页</span><button type="button" disabled={selectedIndex === items.length - 1} onClick={() => moveSelection(1)}>下一条<ChevronRight size={13} /></button></div>
        </section>

        <section className="workbench-pane matrix-pane" aria-label="合规矩阵">
          <div className="pane-title"><div><FileCheck2 size={15} /><span><strong>合规矩阵</strong><small>{visibleItems.length} / {items.length} 条要求</small></span></div><button className="mini-action" type="button" onClick={() => window.alert("已选择的要求可批量分配负责人；当前未勾选项目。") }><Plus size={13} />批量操作</button></div>
          <div className="matrix-filters"><label><Search size={13} /><input aria-label="搜索要求" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索编号、标题、原文" /></label><div className="filter-menu"><Filter size={13} /><select aria-label="筛选要求" value={filter} onChange={(event) => setFilter(event.target.value as FilterKey)}>{Object.entries(filterLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={12} /></div></div>
          <div className="active-filters">{filter !== "all" && <button type="button" onClick={() => setFilter("all")}>{filterLabels[filter]} <X size={11} /></button>}<span>{visibleItems.filter((item) => item.confidence < .7).length} 条低置信度已路由人工</span></div>
          <div className="matrix-table-wrap" ref={tableRef}>
            <table className="matrix-table"><thead><tr><th>编号 / 要求</th><th>风险</th><th>状态</th><th>证据 / 置信度</th><th>负责人</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id} className={item.id === selected.id ? "selected" : ""} tabIndex={0} aria-selected={item.id === selected.id} onClick={() => select(item)} onKeyDown={(event) => rowKeyDown(event, item)}><td><span>{item.code} · {item.category}</span><strong>{item.title}</strong><small>{item.mandatory ? "强制" : "一般"}{item.disqualification ? " · 否决风险" : ""} · 第 {item.page} 页</small></td><td><RiskBadge level={item.risk} /></td><td><StatusBadge status={item.status} /></td><td><span className="evidence-name">{item.evidence ?? "暂无证据"}</span><ConfidenceIndicator value={item.confidence} /></td><td><span className={item.owner === "未分配" ? "unassigned" : "owner-chip"}>{item.owner}</span><small>{item.dueDate}</small></td></tr>)}</tbody></table>
            {visibleItems.length === 0 && <div className="empty-state"><strong>没有匹配的要求</strong>清除筛选条件以查看全部 20 条。</div>}
          </div>
          <div className="matrix-footer"><span>↑↓ 选择 · Enter 打开</span><span>已加载全部 {visibleItems.length} 条</span></div>
        </section>

        <section className="workbench-pane detail-pane" aria-label="要求详情">
          <div className="detail-summary"><div><span>{selected.code} · {selected.category}</span><h2>{selected.title}</h2></div><RiskBadge level={selected.risk} /></div>
          <SourceCitation document={selected.sourceDocument} page={selected.page} clause={selected.clause} version={selected.sourceVersion} onNavigate={() => setFlash((value) => value + 1)} />
          <div className="detail-tabs" role="tablist">{([['detail','要求详情'],['evidence','证据'],['judgement','判断'],['activity','活动']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}{key === "activity" && <span>3</span>}</button>)}</div>
          <div className="detail-scroll">
            {tab === "detail" && <DetailTabContent selected={selected} onCopy={copyText} />}
            {tab === "evidence" && <EvidenceTab selected={selected} state={evidenceState} onState={setEvidenceState} />}
            {tab === "judgement" && <JudgementTab selected={selected} onOverride={() => setOverrideOpen(true)} />}
            {tab === "activity" && <ActivityTab selected={selected} />}
          </div>
        </section>
      </div>

      {overrideOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOverrideOpen(false)}><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="override-title"><div className="dialog-title"><div><h2 id="override-title">人工覆盖系统判断</h2><p>当前为本地演示状态；连接后端后由覆盖 API 保留原结果和原因。</p></div><button className="icon-button" type="button" aria-label="关闭" onClick={() => setOverrideOpen(false)}><X size={15} /></button></div><label className="form-field"><span>覆盖后状态</span><select value={overrideStatus} onChange={(event) => setOverrideStatus(event.target.value as RequirementStatus)}><option value="met">已满足</option><option value="failed">不满足</option><option value="review">继续人工复核</option><option value="missing">缺少证据</option></select></label><label className="form-field"><span>覆盖原因 <em>必填</em></span><textarea autoFocus rows={4} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="说明核验的原件、规则例外或其他依据，不少于一句完整说明。" /></label><div className="dialog-warning"><AlertTriangle size={14} />人工覆盖不等同于法律资格结论，仍须由授权审批人复核。</div><div className="dialog-actions"><button className="button" type="button" onClick={() => setOverrideOpen(false)}>取消</button><button className="button primary" type="button" disabled={!overrideReason.trim()} onClick={submitOverride}>保存本地演示状态</button></div></div></div>}
    </div>
  );
}

function DetailTabContent({ selected, onCopy }: { selected: Requirement; onCopy: () => void }) { return <div className="detail-sections"><section><h3>标准化要求</h3><p className="normalized-text">{selected.normalizedText}</p></section><section><div className="section-heading"><h3>招标原文</h3><button type="button" onClick={onCopy}><Clipboard size={12} />复制</button></div><blockquote>{selected.originalText}</blockquote></section><dl className="detail-grid"><div><dt>条款号</dt><dd>{selected.clause}</dd></div><div><dt>来源页</dt><dd>第 {selected.page} 页</dd></div><div><dt>强制性</dt><dd>{selected.mandatory ? "是 · 强制" : "否 · 一般"}</dd></div><div><dt>否决风险</dt><dd>{selected.disqualification ? "是 · 需重点确认" : "否"}</dd></div></dl><section><h3>期望证明材料</h3><p>{selected.expectedEvidence}</p></section><section><h3>提取置信度</h3><ConfidenceIndicator value={selected.confidence} />{selected.confidence < .7 && <p className="review-routing"><AlertTriangle size={13} />低于 70%，系统未自动确认，已进入人工复核队列。</p>}</section></div>; }
function EvidenceTab({ selected, state, onState }: { selected: Requirement; state: "pending" | "accepted" | "rejected"; onState: (state: "pending" | "accepted" | "rejected") => void }) { return <div className="detail-sections"><section><div className="section-heading"><h3>推荐证据</h3><span className="match-score">匹配 92%</span></div>{selected.evidence ? <article className="evidence-card"><div className="evidence-card-head"><span><FileText size={16} /></span><div><strong>{selected.evidence}</strong><small>上海智园数字科技有限公司 · 当前版本</small></div></div><dl><div><dt>有效期</dt><dd>{selected.status === "missing" ? "已过期 / 待补充" : "2027-12-31"}</dd></div><div><dt>来源页</dt><dd>第 1–2 页</dd></div><div><dt>匹配理由</dt><dd>材料类型、主体与要求关键词一致</dd></div></dl><blockquote>“兹证明上海智园数字科技有限公司所提供材料真实有效……”</blockquote></article> : <div className="no-evidence"><Upload size={21} /><strong>暂未找到可接受证据</strong><p>上传新证据或扩大材料库检索范围。</p></div>}</section>{state === "pending" ? <div className="evidence-actions"><button className="button danger" type="button" onClick={() => onState("rejected")}><X size={13} />拒绝推荐</button><button className="button primary" type="button" disabled={!selected.evidence} onClick={() => onState("accepted")}><Check size={13} />接受证据</button></div> : <div className={`evidence-decision ${state}`}><strong>{state === "accepted" ? "证据已接受" : "推荐已拒绝"}</strong><p>{state === "accepted" ? "该证据将参与后续确定性规则判断。" : "该结果已记录，可上传或选择其他证据。"}</p><button type="button" onClick={() => onState("pending")}>撤销本次操作</button></div>}<button className="button full-width" type="button" onClick={() => window.alert("演示：材料选择器已打开，可从企业材料库更换证据。") }><FileCheck2 size={14} />更换证据</button></div>; }
function JudgementTab({ selected, onOverride }: { selected: Requirement; onOverride: () => void }) { return <div className="detail-sections"><section className="rule-result"><div className="section-heading"><h3>系统结果</h3><StatusBadge status={selected.status} /></div><dl><div><dt>预期条件</dt><dd>{selected.normalizedText}</dd></div><div><dt>实际值</dt><dd>{selected.actualValue}</dd></div><div><dt>使用规则</dt><dd>{selected.rule}</dd></div><div><dt>判断理由</dt><dd>{selected.reasoning}</dd></div></dl></section><section><h3>判断置信度</h3><ConfidenceIndicator value={selected.confidence} /><p className="rule-note">置信度仅表示提取与匹配稳定性，不代表法律准确性。</p></section><button className="button full-width" type="button" onClick={onOverride}><MessageSquareText size={14} />人工覆盖判断</button></div>; }
function ActivityTab({ selected }: { selected: Requirement }) { return <ol className="detail-activity"><li><span>14:26</span><div><strong>刘敏打开要求进行复核</strong><p>查看了来源页和推荐证据。</p></div></li><li><span>14:18</span><div><strong>规则引擎更新判断</strong><p>{selected.rule} · 运行结果已追加。</p></div></li><li><span>14:12</span><div><strong>要求提取完成</strong><p>MockLLMProvider · Prompt v1.2 · 置信度 {Math.round(selected.confidence * 100)}%</p></div></li></ol>; }
function highlightQuery(text: string, query: string) { if (!query.trim()) return text; const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")); return <>{parts.map((part, index) => part.toLowerCase() === query.toLowerCase() ? <mark key={index}>{part}</mark> : part)}</>; }
