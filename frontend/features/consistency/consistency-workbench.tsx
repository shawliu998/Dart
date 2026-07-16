"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, ArrowRight, Check, CheckCircle2, ChevronRight, CircleDollarSign, FileText, GitCompareArrows, Search, UserRound, X } from "lucide-react";
import { RiskBadge } from "@/components/ui/badges";
import { phaseApi } from "@/lib/api/phase2";
import type { ConsistencyIssue, DataSource } from "@/lib/phase-data/types";

const statusText = { open: "待处理", review: "人工复核", resolved: "已解决", reasonable: "合理差异" };

export function ConsistencyWorkbench({ projectId, initialIssues, source }: { projectId: string; initialIssues: ConsistencyIssue[]; source: DataSource }) {
  const [issues, setIssues] = useState(initialIssues);
  const [selectedId, setSelectedId] = useState(initialIssues[0]?.id);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [reason, setReason] = useState("");
  const [standardValue, setStandardValue] = useState(initialIssues[0]?.suggestedValue ?? "");
  const [feedback, setFeedback] = useState("");
  const selected = issues.find((item) => item.id === selectedId) ?? issues[0];
  const filtered = useMemo(() => issues.filter((item) => `${item.field}${item.reason}${item.owner}`.toLowerCase().includes(query.toLowerCase()) && (type === "all" || item.type === type)), [issues, query, type]);

  function selectIssue(issue: ConsistencyIssue) { setSelectedId(issue.id); setStandardValue(issue.suggestedValue); setReason(""); }
  async function resolve(mode: "standard" | "reasonable") {
    if (!reason.trim()) { setFeedback("请先填写处理原因，所有一致性决策都必须可审计。 "); return; }
    const status = mode === "standard" ? "resolved" : "accepted_difference";
    const resolution = mode === "standard" ? `采用标准值：${standardValue}。${reason}` : `接受合理差异：${reason}`;
    const result = await phaseApi.resolveConsistency(selected.id, status, resolution);
    if (result.failed) { setFeedback(result.message); return; }
    setIssues((current) => current.map((item) => item.id === selected.id ? { ...item, suggestedValue: standardValue, status: mode === "standard" ? "resolved" : "reasonable", reason: resolution } : item));
    setFeedback(result.message);
  }
  async function createTask() {
    const result = await phaseApi.createTask(projectId, { title: `整改一致性问题：${selected.field}`, priority: selected.risk === "fatal" ? "critical" : "high", status: "todo", sourceType: "consistency", sourceLabel: `${selected.field} · ${selected.id}`, reason: selected.reason, evidence: selected.sources.map((item) => `${item.document} 第 ${item.page} 页`).join("；") }, selected.id);
    setFeedback(result.message);
  }
  if (!selected) return null;
  return <div className="page consistency-page"><header className="page-header"><div className="page-title-group"><h1>一致性检查</h1><p>确定性比较名称、日期、金额、人员和承诺；发现差异后由人工选择标准值。</p></div><span className={`data-source ${source}`}>{source === "api" ? "API 数据" : "本地演示数据"}</span></header>
    <section className="consistency-stats"><Stat icon={<CircleDollarSign />} label="金额差异" value={issues.filter((item) => item.type === "amount").length} tone="fatal" onClick={() => setType("amount")} /><Stat icon={<UserRound />} label="主体 / 人员" value={issues.filter((item) => ["entity","person"].includes(item.type)).length} onClick={() => setType("entity")} /><Stat icon={<GitCompareArrows />} label="承诺差异" value={issues.filter((item) => item.type === "commitment").length} onClick={() => setType("commitment")} /><Stat icon={<CheckCircle2 />} label="已处理" value={issues.filter((item) => ["resolved","reasonable"].includes(item.status)).length} tone="success" onClick={() => setType("all")} /></section>
    {feedback && <div className="operation-feedback" role="status"><span>{feedback}</span><button type="button" aria-label="关闭提示" onClick={() => setFeedback("")}><X size={13} /></button></div>}
    <div className="consistency-layout"><section className="panel consistency-list"><div className="toolbar"><label className="search-field"><Search size={13} /><input aria-label="搜索一致性问题" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索字段、原因、负责人" /></label><select className="select-field" aria-label="问题类型" value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部类型</option><option value="amount">金额</option><option value="entity">主体</option><option value="person">人员</option><option value="commitment">承诺</option></select></div><div className="consistency-table-wrap"><table className="consistency-table"><thead><tr><th>字段 / 原因</th><th>发现值</th><th>风险</th><th>建议标准值</th><th>状态</th><th>负责人</th></tr></thead><tbody>{filtered.map((issue) => <tr key={issue.id} className={issue.id === selected.id ? "selected" : ""} onClick={() => selectIssue(issue)}><td><strong>{issue.field}</strong><small>{issue.reason}</small></td><td><strong>{issue.discoveredValues}</strong><small>{issue.documents} 份文件</small></td><td><RiskBadge level={issue.risk} /></td><td>{issue.suggestedValue}</td><td><span className={`issue-status ${issue.status}`}>{statusText[issue.status]}</span></td><td>{issue.owner}<ChevronRight size={12} /></td></tr>)}</tbody></table></div></section>
      <aside className="panel consistency-detail"><header><div><span>{selected.id} · {selected.type}</span><h2>{selected.field}</h2><p>{selected.reason}</p></div><RiskBadge level={selected.risk} /></header><section className="source-comparison"><div className="section-title"><h3>来源并排对比</h3><span>{selected.sources.length} 个来源值</span></div><div className="source-cards">{selected.sources.map((item, index) => <article key={item.id} className={item.value === selected.suggestedValue ? "suggested" : ""}><header><span>来源 {String.fromCharCode(65 + index)}</span>{item.value === selected.suggestedValue && <em><Check size={10} />建议标准</em>}</header><strong>{item.value}</strong><p>“{item.excerpt}”</p><footer><button type="button" onClick={() => window.alert(`已定位 ${item.document} 第 ${item.page} 页。`)}><FileText size={11} />{item.document} · 第 {item.page} 页</button><small>{item.modifiedAt}</small></footer></article>)}</div></section><section className="resolution-box"><h3>人工处理</h3><label><span>采用的标准值</span><select value={standardValue} onChange={(event) => setStandardValue(event.target.value)}>{selected.sources.map((item) => <option key={item.id}>{item.value}</option>)}</select></label><label><span>处理原因 <em>必填</em></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="说明采用该值或接受合理差异的依据。" /></label><div><button className="button" type="button" onClick={createTask}><AlertOctagon size={13} />创建整改任务</button><span /><button className="button" type="button" onClick={() => resolve("reasonable")}>标记合理差异</button><button className="button primary" type="button" onClick={() => resolve("standard")}>采用标准值<ArrowRight size={13} /></button></div></section></aside></div>
  </div>;
}
function Stat({ icon, label, value, tone = "", onClick }: { icon: React.ReactNode; label: string; value: number; tone?: string; onClick: () => void }) { return <button className={tone} type="button" onClick={onClick}><span>{icon}</span><strong>{value}</strong><small>{label}</small></button>; }
