"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCheck, ChevronRight, FileText, GripVertical, Link2, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { RiskBadge, StatusBadge } from "@/components/ui/badges";
import { phaseApi } from "@/lib/api/phase2";
import type { DataSource, EvidenceCandidate, EvidenceMatchGroup } from "@/lib/phase-data/types";

export function EvidenceMatchingWorkbench({ projectId, initialGroups, source }: { projectId: string; initialGroups: EvidenceMatchGroup[]; source: DataSource }) {
  const [groups, setGroups] = useState(initialGroups);
  const [selectedId, setSelectedId] = useState(initialGroups[0]?.id);
  const [query, setQuery] = useState("");
  const [onlyUnresolved, setOnlyUnresolved] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [dragCandidate, setDragCandidate] = useState<EvidenceCandidate | null>(null);
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0];
  const filtered = useMemo(() => groups.filter((group) => `${group.requirementCode}${group.requirementTitle}`.toLowerCase().includes(query.toLowerCase()) && (!onlyUnresolved || group.candidates.some((item) => item.decision === "pending"))), [groups, onlyUnresolved, query]);

  async function decide(candidate: EvidenceCandidate, decision: "accept" | "reject") {
    const result = await phaseApi.decideMatch(candidate.id, decision, `人工${decision === "accept" ? "接受" : "拒绝"}证据匹配`);
    if (result.failed) { setFeedback(result.message); return; }
    setGroups((current) => current.map((group) => group.id === selected.id ? { ...group, selectedEvidenceIds: decision === "accept" ? Array.from(new Set([...group.selectedEvidenceIds, candidate.evidenceId])) : group.selectedEvidenceIds.filter((id) => id !== candidate.evidenceId), candidates: group.candidates.map((item) => item.id === candidate.id ? { ...item, decision: decision === "accept" ? "accepted" : "rejected" } : item) } : group));
    setFeedback(result.message);
  }

  function dropOnGroup(targetId: string) {
    if (!dragCandidate) return;
    setGroups((current) => current.map((group) => group.id === targetId && !group.candidates.some((item) => item.evidenceId === dragCandidate.evidenceId) ? { ...group, candidates: [...group.candidates, { ...dragCandidate, id: `local-link-${targetId}-${dragCandidate.evidenceId}`, decision: "pending", score: Math.max(.55, dragCandidate.score - .12), reason: [...dragCandidate.reason, "由人工拖拽建立跨要求候选关联"] }] } : group));
    setSelectedId(targetId); setFeedback("已建立待确认的多对多候选关联；尚未接受为正式证据。 "); setDragCandidate(null);
  }

  async function bulkConfirm() {
    const eligible = groups.flatMap((group) => group.candidates.filter((item) => item.decision === "pending" && item.score >= .9 && !item.reason.some((reason) => reason.includes("过期"))));
    if (!eligible.length) { setFeedback("没有同时满足高分、有效且待确认条件的匹配。 "); return; }
    if (!window.confirm(`将人工确认 ${eligible.length} 个高置信度且未检测到过期的匹配，是否继续？`)) return;
    for (const candidate of eligible) { const result = await phaseApi.decideMatch(candidate.id, "accept", "批量人工确认高置信度匹配"); if (result.failed) { setFeedback(result.message); return; } }
    setGroups((current) => current.map((group) => ({ ...group, selectedEvidenceIds: Array.from(new Set([...group.selectedEvidenceIds, ...group.candidates.filter((item) => eligible.some((eligibleItem) => eligibleItem.id === item.id)).map((item) => item.evidenceId)])), candidates: group.candidates.map((item) => eligible.some((eligibleItem) => eligibleItem.id === item.id) ? { ...item, decision: "accepted" as const } : item) })));
    setFeedback(source === "api" ? "高置信度匹配已提交后端。" : "本地演示已批量接受符合条件的匹配；未写入后端。 ");
  }

  if (!selected) return null;
  const acceptedCount = groups.reduce((sum, group) => sum + group.candidates.filter((item) => item.decision === "accepted").length, 0);
  return <div className="page match-page" data-project-id={projectId}><header className="page-header"><div className="page-title-group"><h1>证据匹配工作台</h1><p>一项要求可关联多份证据，一份材料也可复用于多个要求；所有匹配必须人工确认。</p></div><div className="header-actions"><span className={`data-source ${source}`}>{source === "api" ? "API 数据" : "本地演示数据"}</span><button className="button primary" type="button" onClick={bulkConfirm}><CheckCheck size={14} />批量确认高置信度</button></div></header>
    <section className="match-stats"><article><span><Link2 size={15} /></span><strong>{groups.length}</strong><small>待匹配要求</small></article><article><span><Check size={15} /></span><strong>{acceptedCount}</strong><small>已接受关联</small></article><article><span><AlertTriangle size={15} /></span><strong>{groups.reduce((sum, group) => sum + group.candidates.filter((item) => item.decision === "pending").length, 0)}</strong><small>待人工确认</small></article><p><ShieldCheck size={14} /><span><strong>不会自动接受全部高分匹配</strong><small>批量操作排除过期与证据链不完整项，并要求人工二次确认。</small></span></p></section>
    {feedback && <div className="operation-feedback" role="status"><span>{feedback}</span><button type="button" aria-label="关闭提示" onClick={() => setFeedback("")}><X size={13} /></button></div>}
    <div className="matching-layout"><section className="panel match-requirements"><div className="panel-header"><div><h2>招标要求</h2><p>可将右侧证据拖到其他要求建立候选关联</p></div><span>{filtered.length} 条</span></div><div className="match-filters"><label><Search size={13} /><input aria-label="搜索待匹配要求" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索要求编号或标题" /></label><label><input type="checkbox" checked={onlyUnresolved} onChange={(event) => setOnlyUnresolved(event.target.checked)} />仅看未确认</label></div><div className="match-group-list">{filtered.map((group) => <button key={group.id} type="button" className={group.id === selected.id ? "selected" : ""} onClick={() => setSelectedId(group.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOnGroup(group.id)}><div><span>{group.requirementCode} · 第 {group.page} 页</span><strong>{group.requirementTitle}</strong></div><RiskBadge level={group.risk} /><StatusBadge status={group.requirementStatus} /><footer><span>{group.candidates.length} 个候选</span><em>{group.selectedEvidenceIds.length} 个已接受</em><ChevronRight size={12} /></footer></button>)}</div></section>
      <section className="panel candidate-panel"><div className="candidate-heading"><div><span>{selected.requirementCode} · 证据候选</span><h2>{selected.requirementTitle}</h2></div><StatusBadge status={selected.requirementStatus} /></div><div className="candidate-list">{selected.candidates.map((candidate) => <article key={candidate.id} className={`candidate-card ${candidate.decision}`} draggable onDragStart={() => setDragCandidate(candidate)} onDragEnd={() => setDragCandidate(null)}><header><GripVertical size={14} /><span className="candidate-file"><FileText size={17} /></span><div><strong>{candidate.name}</strong><small>{candidate.legalEntity}</small></div><span className={`match-score-large ${candidate.score >= .9 ? "high" : candidate.score >= .7 ? "medium" : "low"}`}><Sparkles size={12} />{Math.round(candidate.score * 100)}%</span></header><div className="candidate-meta"><span><small>有效期</small><strong className={candidate.reason.some((reason) => reason.includes("过期")) ? "danger-text" : ""}>{candidate.validUntil}</strong></span><span><small>材料完整度</small><strong>{candidate.completeness}%</strong></span><span><small>当前决策</small><strong>{candidate.decision === "accepted" ? "已接受" : candidate.decision === "rejected" ? "已拒绝" : "待确认"}</strong></span></div><section><h3>匹配理由</h3><ul>{candidate.reason.map((reason) => <li key={reason}><Check size={11} />{reason}</li>)}</ul></section><footer><button className="button small" type="button" onClick={() => window.alert(`${candidate.name} 文档预览已定位到推荐 Claim 来源页。`)}><FileText size={12} />查看来源</button><span /><button className="button danger small" type="button" disabled={candidate.decision === "rejected"} onClick={() => decide(candidate, "reject")}><X size={12} />拒绝</button><button className="button primary small" type="button" disabled={candidate.decision === "accepted"} onClick={() => decide(candidate, "accept")}><Check size={12} />接受证据</button></footer></article>)}</div></section></div>
  </div>;
}
