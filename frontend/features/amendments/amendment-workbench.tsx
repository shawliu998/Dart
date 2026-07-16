"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Bell, Check, ClipboardCopy, Download, FileDiff, FileText, ListRestart, Plus, X } from "lucide-react";
import { RiskBadge } from "@/components/ui/badges";
import { phaseApi } from "@/lib/api/phase2";
import type { Amendment, DataSource } from "@/lib/phase-data/types";

export function AmendmentWorkbench({ projectId, initialAmendments, source }: { projectId: string; initialAmendments: Amendment[]; source: DataSource }) {
  const [items, setItems] = useState(initialAmendments);
  const [amendmentId, setAmendmentId] = useState(initialAmendments[0]?.id);
  const amendment = items.find((item) => item.id === amendmentId) ?? items[0];
  const [changeId, setChangeId] = useState(amendment?.changes[0]?.id);
  const [feedback, setFeedback] = useState("");
  const change = amendment?.changes.find((item) => item.id === changeId) ?? amendment?.changes[0];
  if (!amendment || !change) return null;

  function exportReport() {
    const report = { amendment: amendment.name, generated_at: new Date().toISOString(), changes: amendment.changes };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "补充公告变更报告.json"; anchor.click(); URL.revokeObjectURL(url);
  }
  async function applyChange() {
    if (!window.confirm(`应用“${change.clause}”的变更影响？该操作会更新受影响要求状态。`)) return;
    const result = await phaseApi.applyAmendment(amendment.id);
    if (result.failed) { setFeedback(result.message); return; }
    setItems((current) => current.map((item) => item.id === amendment.id ? { ...item, status: "applied", changes: item.changes.map((currentChange) => ({ ...currentChange, status: "applied" })) } : item)); setFeedback(result.message);
  }
  async function rerun() { const result = await phaseApi.rerunCompliance(projectId); setFeedback(result.message); }
  async function task() { const result = await phaseApi.createTask(projectId, { title: `应用补充公告变更：${change.clause}`, priority: change.impact === "fatal" ? "critical" : "high", status: "todo", sourceType: "amendment", sourceLabel: `${amendment.name} · ${change.clause}`, reason: `由“${change.before}”变更为“${change.after}”`, evidence: `${amendment.name}` }, change.id); setFeedback(result.message); }
  async function copyNotice() { await navigator.clipboard.writeText(`【补充公告影响】${change.clause}\n变更后：${change.after}\n影响要求：${change.affectedRequirements.join("、")}\n请在项目工作台完成复核。`); setFeedback("责任人通知摘要已复制，可由人工通过企业批准渠道发送。 "); }

  return <div className="page amendment-page"><header className="page-header"><div className="page-title-group"><h1>补充公告变更分析</h1><p>逐条对比公告前后差异，明确影响对象，并由人工决定是否应用。</p></div><div className="header-actions"><span className={`data-source ${source}`}>{source === "api" ? "API 数据" : "本地演示数据"}</span><button className="button" type="button" onClick={exportReport}><Download size={14} />导出变更报告</button><button className="button primary" type="button" onClick={rerun}><ListRestart size={14} />重跑受影响检查</button></div></header>
    <section className="amendment-summary"><article><span><FileDiff size={16} /></span><strong>{amendment.changeCount}</strong><small>识别变更</small></article><article className="danger"><span><AlertTriangle size={16} /></span><strong>{amendment.highImpactCount}</strong><small>高影响</small></article><article><span><Check size={16} /></span><strong>{amendment.changes.filter((item) => item.status === "applied").length}</strong><small>已应用</small></article><div><Bell size={15} /><span><strong>{amendment.name}</strong><small>发布 {amendment.publishedAt} · 接收 {amendment.receivedAt}</small></span></div></section>
    {feedback && <div className="operation-feedback" role="status"><span>{feedback}</span><button type="button" aria-label="关闭提示" onClick={() => setFeedback("")}><X size={13} /></button></div>}
    <div className="amendment-layout"><aside className="panel amendment-list"><div className="panel-header"><div><h2>公告与变更</h2><p>按影响级别排序</p></div></div><div className="amendment-docs">{items.map((item) => <button key={item.id} className={item.id === amendment.id ? "active" : ""} type="button" onClick={() => { setAmendmentId(item.id); setChangeId(item.changes[0]?.id); }}><FileText size={14} /><span><strong>{item.name}</strong><small>{item.version} · {item.changeCount} 项变更</small></span><em>{item.status === "applied" ? "已应用" : "待复核"}</em></button>)}</div><h3>变更条款</h3><div className="amendment-changes">{amendment.changes.map((item) => <button key={item.id} className={item.id === change.id ? "active" : ""} type="button" onClick={() => setChangeId(item.id)}><span className={`change-type ${item.type}`}>{item.type === "modified" ? "修改" : item.type === "added" ? "新增" : "删除"}</span><span><strong>{item.clause}</strong><small>{item.affectedRequirements.length} 个要求 · {item.affectedTasks.length} 个任务</small></span><RiskBadge level={item.impact} /></button>)}</div></aside>
      <section className="panel diff-panel"><header><div><span>{change.type === "modified" ? "条款修改" : change.type === "added" ? "新增条款" : "删除条款"}</span><h2>{change.clause}</h2></div><div><RiskBadge level={change.impact} /><span className={`change-status ${change.status}`}>{change.status === "applied" ? "已应用" : "待应用"}</span></div></header><div className="diff-grid"><article className="before"><h3>修改前</h3><p>{change.before}</p><small>原招标文件 V1.0</small></article><div className="diff-arrow"><ArrowRight size={18} /><span>{change.type === "modified" ? "替换" : "新增"}</span></div><article className="after"><h3>修改后</h3><p>{change.after}</p><small>{amendment.name} · {amendment.version}</small></article></div><div className="impact-grid"><Impact label="受影响要求" items={change.affectedRequirements} /><Impact label="受影响证据" items={change.affectedEvidence} /><Impact label="受影响任务" items={change.affectedTasks} /><dl><div><dt>影响报价</dt><dd>{change.affectsPrice ? "是 · 必须复核" : "否"}</dd></div><div><dt>重新审批</dt><dd>{change.needsApproval ? "是 · 需要" : "否"}</dd></div></dl></div><footer><button className="button" type="button" onClick={copyNotice}><ClipboardCopy size={13} />复制责任人通知</button><button className="button" type="button" onClick={task}><Plus size={13} />创建整改任务</button><span /><button className="button primary" type="button" disabled={change.status === "applied"} onClick={applyChange}><Check size={13} />{change.status === "applied" ? "变更已应用" : "接受并应用变更"}</button></footer></section></div>
  </div>;
}
function Impact({ label, items }: { label: string; items: string[] }) { return <section><h3>{label}</h3>{items.length ? items.map((item) => <p key={item}>{item}</p>) : <small>无直接影响</small>}</section>; }
