"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  Bell,
  Building2,
  CalendarClock,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Files,
  FileWarning,
  FolderKanban,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Scale,
  GitCompareArrows,
  ListTodo,
  PackageCheck,
  ScrollText,
} from "lucide-react";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { clearSession, demoUser, sessionSnapshot, subscribeSession, type SessionUser } from "@/lib/api/auth";

const primaryNav = [
  { label: "工作台", href: "/projects", icon: LayoutDashboard },
  { label: "投标项目", href: "/projects", icon: FolderKanban },
  { label: "企业材料库", href: "/evidence", icon: Files },
];

const projectNav = [
  { label: "项目总览", path: "overview", icon: LayoutDashboard },
  { label: "招标要求", path: "requirements", icon: ClipboardCheck },
  { label: "否决项", path: "disqualifications", icon: FileWarning },
  { label: "证据匹配", path: "evidence-matching", icon: Scale },
  { label: "一致性检查", path: "consistency", icon: GitCompareArrows },
  { label: "补充公告", path: "amendments", icon: FileWarning },
  { label: "整改任务", path: "tasks", icon: ListTodo },
  { label: "文件封装", path: "package", icon: PackageCheck },
  { label: "审计记录", path: "audit", icon: ScrollText },
];

function projectIdFromPath(pathname: string) {
  const match = pathname.match(/^\/projects\/([^/]+)\//);
  return match?.[1] ?? DEMO_PROJECT_ID;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sessionJson = useSyncExternalStore(subscribeSession, sessionSnapshot, () => null);
  const session = sessionJson ? JSON.parse(sessionJson) as SessionUser : demoUser;
  const inProject = /^\/projects\/[^/]+\/(overview|requirements|disqualifications|evidence-matching|consistency|amendments|tasks|package|audit)/.test(pathname);
  const projectId = projectIdFromPath(pathname);

  if (pathname === "/login") return <main>{children}</main>;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <Link className="brand" href="/projects" aria-label="标证通首页">
          <span className="brand-mark" aria-hidden="true"><ShieldCheck size={20} /></span>
          <span><strong>标证通</strong><small>BidEvidence</small></span>
        </Link>

        <div className="tenant-switcher">
          <Building2 size={16} aria-hidden="true" />
          <span><small>当前企业</small><strong>上海智园数字科技</strong></span>
          <ChevronDown size={14} aria-hidden="true" />
        </div>

        <nav className="nav-list">
          <p className="nav-label">工作空间</p>
          {primaryNav.map((item, index) => {
            const Icon = item.icon;
            const active = pathname === item.href && (item.href === "/evidence" || index === 1);
            return <Link key={`${item.label}-${index}`} className={active ? "nav-item active" : "nav-item"} href={item.href}><Icon size={17} />{item.label}</Link>;
          })}
        </nav>

        {inProject && (
          <nav className="nav-list project-nav" aria-label="项目内导航">
            <p className="nav-label">当前项目</p>
            {projectNav.map((item) => {
              const href = `/projects/${projectId}/${item.path}`;
              const Icon = item.icon;
              return <Link key={item.path} className={pathname === href ? "nav-item active" : "nav-item"} href={href}><Icon size={17} />{item.label}</Link>;
            })}
          </nav>
        )}

        <div className="sidebar-foot">
          <div className="trust-note"><ShieldCheck size={15} /><span><strong>证据优先</strong><small>重要结论均可回溯原文</small></span></div>
          <button className="nav-item plain-button" type="button" onClick={() => window.alert("帮助中心将在新窗口提供；当前演示可从项目列表进入。") }><CircleHelp size={17} />使用帮助</button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-context">
            {inProject ? <><span className="eyebrow">当前项目</span><strong>智慧园区综合管理平台采购项目</strong><span className="stage-pill">要求确认</span></> : <><span className="eyebrow">招投标合规与交付工作台</span><strong>项目组合</strong></>}
          </div>
          <div className="topbar-actions">
            {inProject && <><span className="deadline-inline"><CalendarClock size={15} />截止剩余 <strong>13天 18时</strong></span><span className="risk-inline"><FileWarning size={15} />致命风险 <strong>3</strong></span><span className="deadline-inline">待整改 <strong>6</strong> · 封装阻塞 <strong>2</strong></span></>}
            <label className="global-search"><Search size={16} /><span className="sr-only">全局搜索</span><input aria-label="全局搜索" placeholder="搜索项目、要求、材料" /></label>
            <button className="icon-button" type="button" aria-label="通知（3 条未读）" onClick={() => window.alert("3 条通知：2 项待复核，1 项即将到期。") }><Bell size={18} /><span className="notification-dot">3</span></button>
            <button className="user-button" type="button" aria-label="退出当前用户" title={`${session.name} · ${session.role} · ${session.source === "demo" ? "演示会话" : "API 会话"}`} onClick={() => { if (window.confirm(`退出 ${session.name} 的当前会话？`)) { clearSession(); window.location.href = "/login"; } }}><span>{session.name.slice(0, 1)}</span><small>{session.role.split(" /")[0]}</small><ChevronDown size={14} /></button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
