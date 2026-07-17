"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bot, Building2, CalendarClock, ChevronDown, CircleHelp, ClipboardCheck, Files, FileWarning, FolderKanban, GitCompareArrows, LayoutDashboard, ListTodo, PackageCheck, ScrollText, Search, ShieldCheck, Scale } from "lucide-react";
import { clearSession, demoUser, sessionSnapshot, subscribeSession, type SessionUser } from "@/lib/api/auth";
import { globalRoutes } from "@/lib/product-context";
import { useShellProductContext } from "@/lib/product-context-client";
import { AgentStatusControl } from "@/components/agent";
import { CommandPalette } from "@/components/command/command-palette";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FeedbackProvider, useFeedback } from "@/components/feedback/feedback-provider";

const primaryNav = [
  { label: "工作台", href: globalRoutes.dashboard, icon: LayoutDashboard }, { label: "投标项目", href: globalRoutes.projects, icon: FolderKanban }, { label: "企业材料库", href: globalRoutes.evidence, icon: Files }, { label: "全局任务", href: globalRoutes.tasks, icon: ListTodo }, { label: "Agent 中心", href: globalRoutes.agent, icon: Bot }, { label: "审计记录", href: globalRoutes.audit, icon: ScrollText },
];
const projectNav = [
  { label: "项目总览", path: "overview", icon: LayoutDashboard }, { label: "招标要求", path: "requirements", icon: ClipboardCheck }, { label: "否决项", path: "disqualifications", icon: FileWarning }, { label: "证据匹配", path: "evidence-matching", icon: Scale }, { label: "一致性检查", path: "consistency", icon: GitCompareArrows }, { label: "补充公告", path: "amendments", icon: FileWarning }, { label: "整改任务", path: "tasks", icon: ListTodo }, { label: "文件封装", path: "package", icon: PackageCheck }, { label: "审计记录", path: "audit", icon: ScrollText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <FeedbackProvider>{pathname === "/login" ? <main>{children}</main> : <AppShellBody pathname={pathname}>{children}</AppShellBody>}</FeedbackProvider>;
}

function AppShellBody({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const sessionJson = useSyncExternalStore(subscribeSession, sessionSnapshot, () => null);
  const session = sessionJson ? JSON.parse(sessionJson) as SessionUser : demoUser;
  const shellContext = useShellProductContext(pathname);
  const project = shellContext.context;
  const [commandOpen, setCommandOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { notify } = useFeedback();
  const pageLabel = primaryNav.find((item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)))?.label ?? "招投标工作台";

  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((value) => !value); } }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);

  const pendingApprovals = shellContext.agent?.approvals.filter((item) => item.status === "pending").length ?? 0;
  return <div className="app-shell v2-app-shell"><aside className="sidebar v2-sidebar" aria-label="主导航"><Link className="brand" href="/dashboard" aria-label="标证通首页"><span className="brand-mark" aria-hidden="true"><ShieldCheck size={20} /></span><span><strong>标证通</strong><small>BidEvidence</small></span></Link><div className="tenant-switcher"><Building2 size={16} /><span><small>当前企业</small><strong>上海智园数字科技</strong></span><ChevronDown size={14} /></div><nav className="nav-list"><p className="nav-label">工作空间</p>{primaryNav.map((item) => { const Icon = item.icon; const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)); return <Link key={item.href} className={active ? "nav-item active" : "nav-item"} href={item.href}><Icon size={17} />{item.label}</Link>; })}</nav>{project && <nav className="nav-list project-nav" aria-label="项目内导航"><p className="nav-label">当前项目</p>{projectNav.map((item) => { const href = `/projects/${project.id}/${item.path}`; const Icon = item.icon; return <Link key={item.path} className={pathname === href ? "nav-item active" : "nav-item"} href={href}><Icon size={17} />{item.label}</Link>; })}</nav>}<div className="sidebar-foot"><Link className="sidebar-agent-card" href="/agent"><span className="agent-live"><i />{shellContext.status === "error" ? "Agent 数据不可用" : "Agent 需人工处理"}</span><strong>{shellContext.status === "error" ? "API 聚合失败" : `${pendingApprovals} 个人工门禁待处理`}</strong><small>{shellContext.source === "api" ? "来源：API" : shellContext.source === "demo" ? "来源：确定性演示" : "未自动回退演示数据"}</small></Link><div className="trust-note"><ShieldCheck size={15} /><span><strong>证据优先</strong><small>重要结论均可回溯原文</small></span></div><button className="nav-item plain-button" type="button" onClick={() => notify({ title: "演示帮助", description: "使用 ⌘K 搜索项目、要求、材料或运行结构化 Agent 动作。", tone: "info" })}><CircleHelp size={17} />使用帮助</button></div></aside><div className="shell-main"><header className="topbar v2-topbar"><div className="topbar-context">{project ? <><span className="eyebrow">当前项目 · {project.sourceLabel}</span><strong>{project.name}</strong><span className="stage-pill">{project.stage}</span></> : <><span className="eyebrow">招投标合规与交付工作台</span><strong>{pageLabel}</strong></>}</div><div className="topbar-actions">{project && <div className="project-status-strip"><span><CalendarClock size={15} />截止剩余 <strong>{project.deadlineLabel}</strong></span><span><FileWarning size={15} />致命风险 <strong>{project.fatalRiskCount}</strong></span><span>待整改 <strong>{project.taskCount}</strong></span><span>封装阻塞 <strong>{project.packageBlockers}</strong></span></div>}{shellContext.agent ? <AgentStatusControl bundle={shellContext.agent} source={shellContext.source === "api" ? "api" : "demo"} /> : <span className="agent-status-unavailable"><Bot size={15} />{shellContext.status === "loading" ? "Agent 正在聚合…" : "Agent 数据不可用"}</span>}<button className="global-search v2-global-search" type="button" aria-label="打开全局搜索" onClick={() => setCommandOpen(true)}><Search size={16} /><span>搜索项目、要求、材料或动作</span><kbd>⌘ K</kbd></button><NotificationCenter project={project} /><div className="user-menu-wrap"><button className="user-button" type="button" aria-expanded={userOpen} onClick={() => setUserOpen((value) => !value)}><span>{session.name.slice(0, 1)}</span><small>{session.role.split(" /")[0]}</small><ChevronDown size={14} /></button>{userOpen && <div className="user-popover"><strong>{session.name}</strong><small>{session.role}</small><em>{session.source === "demo" ? "演示会话" : "API 会话"}</em><button type="button" onClick={() => { setUserOpen(false); setLogoutOpen(true); }}>退出当前会话</button></div>}</div></div></header><main className="page-content">{children}</main></div><CommandPalette open={commandOpen} project={project} onClose={() => setCommandOpen(false)} /><ConfirmDialog open={logoutOpen} title="退出当前会话？" description={`将退出 ${session.name} 的当前会话，未提交的页面输入可能丢失。`} confirmLabel="确认退出" tone="danger" onClose={() => setLogoutOpen(false)} onConfirm={() => { clearSession(); window.location.href = "/login"; }} /></div>;
}
