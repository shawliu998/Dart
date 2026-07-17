"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, CheckCircle2, FileText, Save, Search, ShieldCheck } from "lucide-react";
import { DataUnavailableState } from "@/components/feedback/data-unavailable-state";
import { MutationFeedback, type MutationResult } from "@/components/feedback/mutation-feedback";
import type { DataSource } from "@/lib/phase-data/types";
import { responseApi, type TenderResponse } from "@/lib/api/responses";

const statusLabels: Record<TenderResponse["status"], string> = { not_started: "未开始", drafted: "草稿待编辑", needs_review: "待人工复核", missing_evidence: "缺少材料", approved: "已批准", excluded: "不适用" };

export function ResponseWorkbench({ projectId, initialResponses, source, loadError }: { projectId: string; initialResponses: TenderResponse[]; source: DataSource; loadError?: string }) {
  const [items, setItems] = useState(initialResponses);
  const [selectedId, setSelectedId] = useState(initialResponses[0]?.id);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(initialResponses[0] ? contentOf(initialResponses[0]) : "");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState<"save" | "approve" | null>(null);
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const filtered = useMemo(() => items.filter((item) => `${item.id}${item.strategy}${contentOf(item)}${item.missingInformation.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [items, query]);

  if (loadError) return <DataUnavailableState title="投标响应 API 数据不可用" message={loadError} />;
  if (!items.length) return <main className="page"><header className="page-header"><div className="page-title-group"><h1>投标响应工作台</h1><p>逐条响应只引用已由人工接受的证据；生成完成后将在此处进入人工复核。</p></div></header><section className="panel empty-state"><FileText size={28} aria-hidden="true" /><strong>尚未生成投标响应草稿</strong><p>请先完成证据匹配与合规检查，然后在 Agent 工作流中生成响应草稿。</p></section></main>;

  function choose(item: TenderResponse) { setSelectedId(item.id); setDraft(contentOf(item)); setReason(""); setFeedback(null); }
  async function save() {
    if (!selected || !draft.trim() || !reason.trim()) { setFeedback(errorFeedback("保存需要填写响应内容和修改原因。")); return; }
    setWorking("save");
    try { const updated = await responseApi.save(selected.id, draft, reason); update(updated); setFeedback(successFeedback("响应草稿已保存", "修改已写入后端，并重新进入人工复核。")); }
    catch (error) { setFeedback(errorFeedback(`未保存响应：${error instanceof Error ? error.message : "未知错误"}`)); }
    finally { setWorking(null); }
  }
  async function approve() {
    if (!selected || !reason.trim()) { setFeedback(errorFeedback("批准前请填写复核意见，确保决策可审计。")); return; }
    if (selected.status === "missing_evidence") { setFeedback(errorFeedback("该条响应缺少材料，补齐并保存后才可批准。")); return; }
    setWorking("approve");
    try { const updated = await responseApi.approve(selected.id, reason); update(updated); setFeedback(successFeedback("响应已批准", "人工批准已写入后端审计，可用于后续导出。")); }
    catch (error) { setFeedback(errorFeedback(`未批准响应：${error instanceof Error ? error.message : "未知错误"}`)); }
    finally { setWorking(null); }
  }
  function update(updated: TenderResponse) { setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); setDraft(contentOf(updated)); }

  return <main className="page response-page">
    <header className="page-header"><div className="page-title-group"><span className="project-code">响应草稿</span><h1>投标响应工作台</h1><p>项目 {projectId} · <span className={`data-source ${source}`}>{source === "api" ? "API 数据" : "确定性演示"}</span> · 内容必须经过人工编辑和批准。</p></div><div className="response-summary"><span><strong>{items.length}</strong> 条响应</span><span><strong>{items.filter((item) => item.status === "approved").length}</strong> 已批准</span><span className="warning"><strong>{items.filter((item) => item.status === "missing_evidence").length}</strong> 缺少材料</span></div></header>
    <MutationFeedback result={feedback} operation={working ? { status: "loading", title: working === "save" ? "正在保存响应" : "正在批准响应" } : undefined} />
    <div className="response-layout"><section className="panel response-list"><div className="panel-header"><div><h2>逐条响应</h2><p>按 Agent 生成顺序展示</p></div></div><label className="response-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="检索策略、内容或缺少材料" /></label><div className="response-list-items">{filtered.map((item) => <button type="button" key={item.id} onClick={() => choose(item)} className={item.id === selected.id ? "selected" : ""}><span className={`response-status ${item.status}`}>{statusLabels[item.status]}</span><strong>{item.strategy}</strong><small>{item.missingInformation.length ? `待补：${item.missingInformation.join("；")}` : `${item.evidenceClaimIds.length} 条已接受证据引用`}</small></button>)}</div></section>
      <section className="panel response-editor"><div className="panel-header"><div><h2>{selected.strategy}</h2><p>版本 {selected.version} · 置信度 {selected.confidence === null ? "待确认" : `${Math.round(selected.confidence * 100)}%`}</p></div><span className={`response-status ${selected.status}`}>{statusLabels[selected.status]}</span></div><div className="response-editor-body">{selected.missingInformation.length > 0 && <aside className="response-missing"><AlertOctagon size={16} /><span><strong>缺少材料</strong><small>{selected.missingInformation.join("；")}。系统不会编造响应内容。</small></span></aside>}<section><h3>响应策略</h3><p>{selected.strategy}</p></section><section><h3>风险提示</h3><ul>{selected.riskNotes.length ? selected.riskNotes.map((note) => <li key={note}>{note}</li>) : <li>未发现额外风险提示，仍须人工核实原文。</li>}</ul></section><label className="response-draft"><span>投标响应内容</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="投标响应内容" /></label><label className="response-reason"><span>修改／复核意见（必填，写入审计）</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：已核对营业执照和项目经理证书原件" /></label></div><footer className="response-actions"><small><ShieldCheck size={14} /> 仅已批准响应可进入导出产物。</small><span /><button className="button" type="button" disabled={working !== null} onClick={save}><Save size={15} />保存并复核</button><button className="button primary" type="button" disabled={working !== null || selected.status === "approved"} onClick={approve}><CheckCircle2 size={15} />{selected.status === "approved" ? "已批准" : "批准响应"}</button></footer></section></div>
  </main>;
}

function contentOf(item: TenderResponse) { return item.editedText ?? item.draftText; }
function errorFeedback(message: string): MutationResult { return { source: "api", persisted: false, status: "error", title: "操作未完成", message }; }
function successFeedback(title: string, message: string): MutationResult { return { source: "api", persisted: true, status: "success", title, message }; }
