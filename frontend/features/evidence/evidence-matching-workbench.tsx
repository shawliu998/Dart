"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Bot, Check, CheckCheck, ChevronDown, Circle, Download, FileText, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { MutationFeedback, type MutationResult } from "@/components/feedback/mutation-feedback";
import { phaseApi } from "@/lib/api/phase2";
import type { DataSource, EvidenceCandidate, EvidenceMatchGroup } from "@/lib/phase-data/types";

type MatrixRow = { group: EvidenceMatchGroup; candidate: EvidenceCandidate; evidencePage: number };

const riskText: Record<EvidenceMatchGroup["risk"], string> = { fatal: "否决风险", high: "高风险", medium: "中风险", low: "低风险" };
const decisionText: Record<EvidenceCandidate["decision"], string> = { pending: "待确认", accepted: "已接受", rejected: "已拒绝" };

const actionFeedback = (result: { message: string; persisted: boolean; failed?: boolean }, source: DataSource): MutationResult => ({
  source,
  persisted: result.persisted,
  status: result.failed ? "error" : result.persisted ? "success" : "warning",
  title: result.failed ? "证据决策失败" : "证据决策已完成",
  message: result.message,
});

function csvCell(value: string | number) { return `"${String(value).replaceAll('"', '""')}"`; }

export function EvidenceMatchingWorkbench({ projectId, initialGroups, source, error }: { projectId: string; initialGroups: EvidenceMatchGroup[]; source: DataSource; error?: string }) {
  const [groups, setGroups] = useState(initialGroups);
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | EvidenceMatchGroup["risk"]>("all");
  const [decisionFilter, setDecisionFilter] = useState<"all" | EvidenceCandidate["decision"]>("all");
  const [compactColumns, setCompactColumns] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState(initialGroups[0]?.id);
  const [selectedCandidateId, setSelectedCandidateId] = useState(initialGroups[0]?.candidates[0]?.id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rejectCandidate, setRejectCandidate] = useState<EvidenceCandidate | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const rows = useMemo<MatrixRow[]>(() => groups.flatMap((group) => group.candidates.map((candidate, index) => ({ group, candidate, evidencePage: index + 1 }))), [groups]);
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter(({ group, candidate }) =>
      (!normalized || `${group.requirementCode}${group.requirementTitle}${candidate.name}`.toLowerCase().includes(normalized)) &&
      (riskFilter === "all" || group.risk === riskFilter) &&
      (decisionFilter === "all" || candidate.decision === decisionFilter),
    );
  }, [decisionFilter, query, riskFilter, rows]);

  const selected = groups.find((group) => group.id === selectedId) ?? groups[0];
  const selectedCandidate = selected?.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? selected?.candidates[0];
  const acceptedCount = rows.filter(({ candidate }) => candidate.decision === "accepted").length;
  const pendingCount = rows.filter(({ candidate }) => candidate.decision === "pending").length;
  const riskCount = groups.filter((group) => group.risk === "fatal" || group.risk === "high").length;
  const eligibleRows = rows.filter(({ candidate }) => candidate.decision === "pending" && candidate.score >= 0.9 && !candidate.reason.some((reason) => reason.includes("过期")) && (!selectedRowIds.size || selectedRowIds.has(candidate.id)));
  const filtersActive = Boolean(query.trim() || riskFilter !== "all" || decisionFilter !== "all");

  function openCandidate(group: EvidenceMatchGroup, candidate: EvidenceCandidate) {
    setSelectedId(group.id); setSelectedCandidateId(candidate.id); setFeedback(null); setDrawerOpen(true);
  }

  function toggleRow(candidateId: string) {
    setSelectedRowIds((current) => { const next = new Set(current); if (next.has(candidateId)) next.delete(candidateId); else next.add(candidateId); return next; });
  }

  function toggleVisibleRows() {
    const visibleIds = filteredRows.map(({ candidate }) => candidate.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedRowIds.has(id));
    setSelectedRowIds((current) => { const next = new Set(current); visibleIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id))); return next; });
  }

  async function decide(candidate: EvidenceCandidate, decision: "accept" | "reject", reason = "") {
    if (!selected) return;
    const decisionReason = decision === "reject" ? reason : "人工接受证据匹配";
    if (decision === "reject" && !decisionReason.trim()) return;
    const result = await phaseApi.decideMatch(candidate.id, decision, decisionReason);
    if (result.failed) { setFeedback(actionFeedback(result, source)); return; }
    const selectedGroupId = selected.id;
    setGroups((current) => current.map((group) => group.id === selectedGroupId ? {
      ...group,
      selectedEvidenceIds: decision === "accept" ? Array.from(new Set([...group.selectedEvidenceIds, candidate.evidenceId])) : group.selectedEvidenceIds.filter((id) => id !== candidate.evidenceId),
      candidates: group.candidates.map((item) => item.id === candidate.id ? { ...item, decision: decision === "accept" ? "accepted" : "rejected" } : item),
    } : group));
    setFeedback(actionFeedback(result, source)); setRejectCandidate(null); setRejectReason("");
  }

  async function bulkConfirm() {
    for (const { candidate } of eligibleRows) {
      const result = await phaseApi.decideMatch(candidate.id, "accept", "批量人工确认高置信度匹配");
      if (result.failed) { setFeedback(actionFeedback(result, source)); return; }
    }
    const eligibleIds = new Set(eligibleRows.map(({ candidate }) => candidate.id));
    setGroups((current) => current.map((group) => ({
      ...group,
      selectedEvidenceIds: Array.from(new Set([...group.selectedEvidenceIds, ...group.candidates.filter((candidate) => eligibleIds.has(candidate.id)).map((candidate) => candidate.evidenceId)])),
      candidates: group.candidates.map((candidate) => eligibleIds.has(candidate.id) ? { ...candidate, decision: "accepted" as const } : candidate),
    })));
    setFeedback({ source, persisted: source === "api", status: source === "api" ? "success" : "warning", title: "批量确认已完成", message: source === "api" ? "高置信度匹配已提交后端。" : "本地演示已接受符合条件的匹配。" });
    setSelectedRowIds(new Set()); setBulkOpen(false);
  }

  function exportMatrix() {
    const csvRows = [["要求编号", "招标要求", "风险", "招标页", "证据材料", "匹配度", "完整度", "人工决策"], ...rows.map(({ group, candidate }) => [group.requirementCode, group.requirementTitle, riskText[group.risk], group.page, candidate.name, `${Math.round(candidate.score * 100)}%`, `${candidate.completeness}%`, decisionText[candidate.decision]])];
    const csv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `证据合规矩阵-${projectId}.csv`; anchor.click(); URL.revokeObjectURL(url);
    setFeedback({ source, persisted: false, status: "success", title: "矩阵已导出", message: "CSV 文件已生成。" });
  }

  if (error && source === "api") return <div className="page match-page" data-project-id={projectId}><header className="page-header"><div className="page-title-group"><h1>证据匹配工作台</h1><p>逐条核对要求、证据与来源页。</p></div></header><section className="panel empty-state" role="alert" aria-live="assertive"><AlertTriangle size={20} aria-hidden="true" /><span className="status-badge neutral">API 数据不可用</span><strong>证据匹配数据暂时不可用</strong><p>未能从 API 读取该项目的证据匹配。当前页面不会显示替代数据。</p><button className="button" type="button" onClick={() => window.location.reload()}>重试读取</button></section></div>;
  if (!selected || !selectedCandidate) return <div className="page match-page" data-project-id={projectId}><header className="page-header"><div className="page-title-group"><h1>证据匹配工作台</h1><p>逐条核对要求、证据与来源页。</p></div></header><section className="panel empty-state"><FileText size={20} aria-hidden="true" /><strong>暂无待匹配要求</strong><p>解析并确认招标要求后，合规矩阵会显示在这里。</p></section></div>;

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(({ candidate }) => selectedRowIds.has(candidate.id));

  return (
    <div className="gd-inspired-page" data-project-id={projectId}>
      <header className="gd-inspired-head">
        <div><h1>证据匹配工作台</h1><p>智慧园区综合管理平台采购项目</p></div>
        <div className="gd-inspired-actions"><button type="button" onClick={exportMatrix}><Download size={15} />导出矩阵</button><button type="button" onClick={() => setBulkOpen(true)}><CheckCheck size={15} />{selectedRowIds.size ? `批量确认 (${selectedRowIds.size})` : "批量确认"}</button><Link className="primary" href={`/agent?projectId=${projectId}`}><Bot size={15} />运行匹配 Agent</Link></div>
      </header>

      <section className="gd-inspired-metrics" aria-label="匹配概览">
        <Metric label="招标要求" value={groups.length} note={`关联 ${rows.length} 条证据候选`} />
        <Metric label="已人工接受" value={acceptedCount} note="已进入可追溯证据链" tone="success" />
        <Metric label="待人工确认" value={pendingCount} note="需要逐条核对来源" tone="warning" />
        <Metric label="高风险要求" value={riskCount} note="包含否决项与高风险项" tone="danger" />
      </section>

      <section className="gd-inspired-filterbar" aria-label="矩阵筛选">
        <label className="gd-inspired-search"><Search size={16} /><input aria-label="搜索证据匹配" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索要求、编号或文件" /></label>
        <label className="gd-inspired-select"><Filter size={14} /><select aria-label="风险筛选" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)}><option value="all">全部风险</option><option value="fatal">否决风险</option><option value="high">高风险</option><option value="medium">中风险</option><option value="low">低风险</option></select><ChevronDown size={13} /></label>
        <label className="gd-inspired-select"><select aria-label="决策筛选" value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value as typeof decisionFilter)}><option value="all">全部状态</option><option value="pending">待确认</option><option value="accepted">已接受</option><option value="rejected">已拒绝</option></select><ChevronDown size={13} /></label>
        <span className="gd-inspired-result-count" aria-live="polite">显示 {filteredRows.length} / {rows.length} 条</span>
        {filtersActive && <button className="gd-inspired-reset" type="button" onClick={() => { setQuery(""); setRiskFilter("all"); setDecisionFilter("all"); }}><X size={14} />清除筛选</button>}
        <button className="gd-inspired-customize" type="button" aria-pressed={compactColumns} onClick={() => setCompactColumns((value) => !value)}><SlidersHorizontal size={15} />{compactColumns ? "显示完整列" : "精简列"}</button>
      </section>

      {feedback && !drawerOpen && <MutationFeedback result={feedback} />}
      <section className="gd-inspired-table-card" aria-label="证据合规矩阵"><div className="gd-inspired-table-wrap"><table className="gd-inspired-table"><thead><tr><th className="check"><input type="checkbox" aria-label="选择当前筛选结果" checked={allVisibleSelected} onChange={toggleVisibleRows} /></th><th>招标要求</th><th>风险</th><th>人工状态</th><th>来源材料</th><th>匹配度</th>{!compactColumns && <th>完整度</th>}<th>来源页</th><th aria-label="操作" /></tr></thead><tbody>
        {filteredRows.map(({ group, candidate, evidencePage }) => <tr className={selectedRowIds.has(candidate.id) ? "selected" : undefined} key={candidate.id}><td className="check"><input type="checkbox" aria-label={`选择 ${candidate.name}`} checked={selectedRowIds.has(candidate.id)} onChange={() => toggleRow(candidate.id)} /></td><td><button className="gd-inspired-requirement" type="button" onClick={() => openCandidate(group, candidate)}><strong>{group.requirementTitle}</strong><span>{group.requirementCode} · 招标文件第 {group.page} 页</span></button></td><td><span className={`gd-inspired-risk ${group.risk}`}><Circle size={8} fill="currentColor" stroke="none" />{riskText[group.risk]}</span></td><td><span className={`gd-inspired-status ${candidate.decision}`}>{candidate.decision === "accepted" && <Check size={12} />}{decisionText[candidate.decision]}</span></td><td><button className="gd-inspired-source" type="button" aria-label={`查看 ${candidate.name}`} onClick={() => openCandidate(group, candidate)}>{candidate.name}</button></td><td>{Math.round(candidate.score * 100)}%</td>{!compactColumns && <td>{candidate.completeness}%</td>}<td>{evidencePage}</td><td><button className="gd-inspired-row-action" type="button" aria-label={`查看 ${candidate.name} 详情`} onClick={() => openCandidate(group, candidate)}>···</button></td></tr>)}
      </tbody></table>{!filteredRows.length && <div className="gd-inspired-empty">没有符合当前筛选条件的证据匹配。</div>}</div></section>

      {drawerOpen && <div className="gd-inspired-drawer-backdrop" role="presentation" onMouseDown={() => setDrawerOpen(false)}><aside className="gd-inspired-drawer" aria-label="证据详情" onMouseDown={(event) => event.stopPropagation()}><header><div><span>{selected.requirementCode}</span><strong>{selectedCandidate.name}</strong></div><button type="button" aria-label="关闭证据详情" onClick={() => setDrawerOpen(false)}><X size={17} /></button></header><DocumentViewer key={selectedCandidate.id} name={selectedCandidate.name} initialPage={1} pageCount={Math.max(2, selected.page)} excerpt={selectedCandidate.reason.join("；")} focusLabel={selected.requirementTitle} sourceLocation={`${selected.requirementCode} · 招标文件第 ${selected.page} 页`} demo />{feedback && <MutationFeedback result={feedback} />}<div className="gd-inspired-drawer-facts"><strong>{selected.requirementTitle}</strong><span>{riskText[selected.risk]} · 匹配度 {Math.round(selectedCandidate.score * 100)}% · 完整度 {selectedCandidate.completeness}%</span><ul>{selectedCandidate.reason.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><footer><button type="button" disabled={selectedCandidate.decision === "rejected"} onClick={() => { setRejectCandidate(selectedCandidate); setRejectReason(""); }}>拒绝匹配</button><button className="primary" type="button" disabled={selectedCandidate.decision === "accepted"} onClick={() => decide(selectedCandidate, "accept")}><Check size={14} />接受证据</button></footer></aside></div>}

      {bulkOpen && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="批量确认高置信度"><div className="dialog-title"><h2>批量确认高置信度</h2><button className="icon-button" type="button" aria-label="关闭" onClick={() => setBulkOpen(false)}><X size={14} /></button></div><p>{selectedRowIds.size ? "将在已选记录中" : "将在全部记录中"}接受 {eligibleRows.length} 个分数不低于 90%、未发现过期线索且仍待确认的候选。</p><div className="dialog-actions"><button className="button" type="button" onClick={() => setBulkOpen(false)}>取消</button><button className="button primary" type="button" disabled={!eligibleRows.length} onClick={bulkConfirm}>确认接受 {eligibleRows.length} 个</button></div></div></div>}
      {rejectCandidate && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="拒绝证据匹配"><div className="dialog-title"><div><h2>拒绝证据匹配</h2><p>{rejectCandidate.name}</p></div><button className="icon-button" type="button" aria-label="关闭" onClick={() => setRejectCandidate(null)}><X size={14} /></button></div><label className="form-field"><span>拒绝原因 <em>必填</em></span><textarea rows={3} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="主体不一致、已过期、内容不足或其他可复核原因" /></label><div className="dialog-actions"><button className="button" type="button" onClick={() => setRejectCandidate(null)}>取消</button><button className="button danger" type="button" disabled={!rejectReason.trim()} onClick={() => decide(rejectCandidate, "reject", rejectReason)}>记录原因并拒绝</button></div></div></div>}
    </div>
  );
}

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: number; note: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  return <article><span>{label}</span><strong>{value}</strong><small className={tone}>{note}</small></article>;
}
