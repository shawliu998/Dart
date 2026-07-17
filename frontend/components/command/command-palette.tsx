"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, ClipboardCheck, FileSearch, Files, FolderKanban, GitCompareArrows, LayoutDashboard, ListTodo, PackageCheck, RefreshCcw, Scale, ScrollText, Search, ShieldAlert, Sparkles, X } from "lucide-react";
import { MutationFeedback, type MutationResult } from "@/components/feedback/mutation-feedback";
import { useFeedback } from "@/components/feedback/feedback-provider";
import { projects, requirements, DEMO_PROJECT_ID } from "@/lib/demo/data";
import { evidenceAssets } from "@/lib/phase-data/demo";
import { globalRoutes, type ProjectContext } from "@/lib/product-context";

type Icon = typeof Search;
interface CommandItem { kind: "command" | "project" | "requirement" | "material"; id: string; label: string; hint: string; keywords: string; icon: Icon; route?: string; action?: () => void; }
interface AgentAction { id: string; label: string; summary: string; scope: string; data: string; modifiesState: boolean; risk: "normal" | "high"; icon: Icon; destination: string; }

const agentActions: AgentAction[] = [
  { id: "parse", label: "解析招标文件", summary: "生成结构化要求候选，低置信度自动进入人工复核。", scope: "当前项目 / 已上传文件", data: "文件版本、页码、段落与解析日志", modifiesState: false, risk: "normal", icon: FileSearch, destination: "requirements" },
  { id: "rerun-disqualification", label: "否决项检测重跑", summary: "按确定性规则与候选提取重新形成否决项队列。", scope: "当前项目 / 全部有效要求", data: "要求原文、规则版本、当前证据", modifiesState: false, risk: "high", icon: RefreshCcw, destination: "disqualifications" },
  { id: "find-evidence", label: "为缺口寻找证据", summary: "推荐可解释候选，不会自动接受证据匹配。", scope: "当前项目 / 未满足要求", data: "企业材料 Claim、主体、有效期与要求", modifiesState: false, risk: "normal", icon: Scale, destination: "evidence-matching" },
  { id: "consistency", label: "运行一致性检查", summary: "对金额、主体、日期、人员与承诺执行确定性比较。", scope: "当前项目 / 当前文件版本", data: "结构化字段、来源页与规则集", modifiesState: false, risk: "normal", icon: GitCompareArrows, destination: "consistency" },
  { id: "amendment", label: "分析补充公告", summary: "识别公告差异并输出影响关系，等待人工应用。", scope: "当前项目 / 最新公告", data: "招标版本、公告版本、要求与任务", modifiesState: false, risk: "normal", icon: ScrollText, destination: "amendments" },
  { id: "tasks", label: "生成整改任务", summary: "把已确认问题映射为负责人、期限和复核人。", scope: "当前项目 / 已确认问题", data: "风险、负责人目录、项目截止时间", modifiesState: true, risk: "high", icon: ListTodo, destination: "tasks" },
  { id: "package", label: "运行封装检查", summary: "检查缺件、证书时效、命名、元数据与一致性。", scope: "当前项目 / 预览包", data: "受控文件树与封装规则", modifiesState: false, risk: "normal", icon: PackageCheck, destination: "package" },
  { id: "risk-summary", label: "生成风险摘要", summary: "汇总可回溯风险、负责人和下游影响。", scope: "当前项目 / 当前快照", data: "要求、证据、任务、封装结果与审计", modifiesState: false, risk: "normal", icon: ShieldAlert, destination: "overview" },
  { id: "approval", label: "提交人工审批", summary: "将致命结论或交付门禁提交给指定角色。", scope: "当前项目 / 待审批输出", data: "来源证据、影响、可逆性与理由", modifiesState: true, risk: "high", icon: ClipboardCheck, destination: "audit" },
];

export function CommandPalette({ open, project, onClose }: { open: boolean; project: ProjectContext | null; onClose: () => void }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedAction, setSelectedAction] = useState<AgentAction | null>(null);
  const [reason, setReason] = useState("");
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false);
  const [result, setResult] = useState<MutationResult | null>(null);
  const contextProjectId = project?.id ?? DEMO_PROJECT_ID;

  const commands = useMemo<CommandItem[]>(() => {
    const global: CommandItem[] = [
      { kind: "command", id: "dashboard", label: "打开工作台", hint: "总览项目、风险和待办", keywords: "dashboard 工作台 首页", icon: LayoutDashboard, route: globalRoutes.dashboard },
      { kind: "command", id: "projects", label: "打开投标项目", hint: "项目组合与筛选", keywords: "项目 projects", icon: FolderKanban, route: globalRoutes.projects },
      { kind: "command", id: "new-project", label: "新建投标项目", hint: "进入创建向导", keywords: "新建 创建 项目", icon: FolderKanban, route: "/projects/new" },
      { kind: "command", id: "evidence", label: "打开企业材料库", hint: "证书、案例与 Claim", keywords: "材料 证据 evidence", icon: Files, route: globalRoutes.evidence },
      { kind: "command", id: "tasks", label: "打开全局任务", hint: "跨项目整改任务", keywords: "任务 待办 tasks", icon: ListTodo, route: globalRoutes.tasks },
      { kind: "command", id: "agent", label: "打开 Agent 运行中心", hint: "模型运行、队列与人工接管", keywords: "agent ai 模型", icon: Bot, route: globalRoutes.agent },
      { kind: "command", id: "audit", label: "打开全局审计", hint: "跨项目只读记录", keywords: "审计 audit 日志", icon: ScrollText, route: globalRoutes.audit },
    ];
    const searchable: CommandItem[] = [
      ...projects.map((item) => ({ kind: "project" as const, id: `project-${item.id}`, label: item.name, hint: `项目 · ${item.projectCode} · ${item.stage}`, keywords: `${item.buyerName} ${item.owner}`, icon: FolderKanban, route: `/projects/${item.id}/overview` })),
      ...requirements.map((item) => ({ kind: "requirement" as const, id: `requirement-${item.id}`, label: `${item.code} ${item.title}`, hint: `要求 · ${item.sourceDocument} 第 ${item.page} 页`, keywords: `${item.category} ${item.originalText}`, icon: ClipboardCheck, route: `/projects/${DEMO_PROJECT_ID}/requirements?requirement=${item.id}` })),
      ...evidenceAssets.map((item) => ({ kind: "material" as const, id: `material-${item.id}`, label: item.name, hint: `材料 · ${item.type} · ${item.status}`, keywords: `${item.legalEntity} ${item.tags.join(" ")}`, icon: Files, route: `/evidence?asset=${item.id}` })),
    ];
    if (project) global.push({ kind: "command", id: "copy-code", label: "复制当前项目编号", hint: project.code, keywords: "复制 编号 code", icon: ClipboardCheck, action: () => { void navigator.clipboard.writeText(project.code); notify({ title: "项目编号已复制", description: project.code, tone: "success" }); } });
    return [...global, ...searchable];
  }, [notify, project]);

  const normalized = query.trim().toLowerCase();
  const filtered = commands.filter((item) => !normalized || `${item.label} ${item.hint} ${item.keywords}`.toLowerCase().includes(normalized)).slice(0, 18);
  const filteredActions = agentActions.filter((item) => !normalized || `${item.label} ${item.summary} ${item.scope} ${item.data}`.toLowerCase().includes(normalized));

  function close() { setQuery(""); setActiveIndex(0); setSelectedAction(null); setResult(null); setReason(""); setHighRiskConfirmed(false); onClose(); }
  function run(item: CommandItem) { if (item.route) router.push(item.route); else item.action?.(); close(); }
  function selectAction(action: AgentAction) { setSelectedAction(action); setResult(null); setReason(""); setHighRiskConfirmed(false); }
  function executeAction() {
    if (!selectedAction) return;
    if (selectedAction.risk === "high" && (!highRiskConfirmed || reason.trim().length < 6)) return;
    const demoResult: MutationResult = { persisted: false, source: "demo", status: "warning", title: `${selectedAction.label}已完成演示运行`, message: "结果已生成到 Agent Drawer，但未写入后端；来源、规则版本与人工门禁均保留在演示运行记录中。", auditEventId: `DEMO-${selectedAction.id.toUpperCase()}-001` };
    setResult(demoResult);
    notify({ title: demoResult.title, description: "确定性演示 · 未持久化", tone: "warning" });
  }

  if (!open) return null;
  return <div className="command-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="command-palette command-palette-v2" role="dialog" aria-modal="true" aria-label="全局搜索与 Agent 动作"><header><Search size={18} /><input autoFocus aria-label="搜索项目、要求、材料或动作" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => { if (event.key === "Escape") close(); if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(filtered.length - 1, index + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); } if (event.key === "Enter" && filtered[activeIndex]) run(filtered[activeIndex]); }} placeholder="搜索项目、要求、材料，或执行 Agent 动作…" /><kbd>⌘ K</kbd><button type="button" aria-label="关闭命令面板" onClick={close}><X size={16} /></button></header><div className="command-layout"><div className="command-results"><p className="command-section-label">搜索结果 · {filtered.length}</p>{filtered.map((item, index) => { const ItemIcon = item.icon; return <button key={item.id} type="button" className={index === activeIndex ? "active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => run(item)}><span><ItemIcon size={16} /></span><span><strong>{item.label}</strong><small>{item.hint}</small></span><em>{item.kind === "command" ? "命令" : item.kind === "project" ? "项目" : item.kind === "requirement" ? "要求" : "材料"}</em></button>; })}{filtered.length === 0 && <div className="command-empty"><Search size={24} /><strong>没有匹配内容</strong><span>搜索覆盖项目、要求、企业材料和动作。</span></div>}<p className="command-section-label">Agent 动作 · {filteredActions.length}</p>{filteredActions.map((action) => { const ActionIcon = action.icon; return <button key={action.id} type="button" onClick={() => selectAction(action)}><span><ActionIcon size={16} /></span><span><strong>{action.label}</strong><small>{action.scope} · {action.modifiesState ? "修改状态" : "只生成结果"}</small></span><em className={action.risk === "high" ? "command-risk" : ""}>{action.risk === "high" ? "需确认" : "运行"}</em></button>; })}</div>{selectedAction && <aside className="agent-action-drawer" aria-label="Agent 动作详情"><button className="drawer-close" type="button" aria-label="关闭动作详情" onClick={() => setSelectedAction(null)}><X size={15} /></button><span className="agent-drawer-kicker"><Sparkles size={14} />Agent Drawer</span><h2>{selectedAction.label}</h2><p>{selectedAction.summary}</p><dl><div><dt>执行范围</dt><dd>{selectedAction.scope}</dd></div><div><dt>使用数据</dt><dd>{selectedAction.data}</dd></div><div><dt>状态影响</dt><dd>{selectedAction.modifiesState ? "会创建或提交业务记录" : "只生成候选或检查结果"}</dd></div><div><dt>运行来源</dt><dd>MockLLMProvider + 确定性规则</dd></div></dl>{selectedAction.risk === "high" && !result && <div className="agent-action-confirm"><span><AlertTriangle size={15} />高风险动作必须说明理由并二次确认</span><label>执行理由<textarea value={reason} onChange={(event) => { setReason(event.target.value); setHighRiskConfirmed(false); }} placeholder="至少输入 6 个字符，写入审计上下文" /></label><label className="confirm-checkbox"><input type="checkbox" checked={highRiskConfirmed} onChange={(event) => setHighRiskConfirmed(event.target.checked)} />我已核验范围、来源与状态影响</label></div>}<MutationFeedback result={result} />{!result ? <button className="button primary full-width" type="button" disabled={selectedAction.risk === "high" && (!highRiskConfirmed || reason.trim().length < 6)} onClick={executeAction}>{selectedAction.risk === "high" ? "确认并运行演示" : "运行确定性演示"}</button> : <button className="button primary full-width" type="button" onClick={() => { router.push(`/agent?project=${contextProjectId}&action=${selectedAction.id}`); close(); }}>进入 Agent 运行中心</button>}<small className="agent-action-boundary">演示不会做法律资格判断、CA 签名、保证金支付或外部提交。</small></aside>}</div><footer><span><kbd>↑</kbd><kbd>↓</kbd>选择</span><span><kbd>Enter</kbd>打开结果</span><span><kbd>Esc</kbd>关闭</span></footer></section></div>;
}
