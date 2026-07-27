"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Archive,
  Books,
  Buildings,
  CaretDown,
  CheckSquare,
  CirclesFour,
  FileMagnifyingGlass,
  Folder,
  Gauge,
  MagnifyingGlass,
  Package,
  PencilLine,
  Question,
  Robot,
  Scroll,
  SquaresFour,
} from "@phosphor-icons/react";
import { clearSession, demoUser, sessionSnapshot, subscribeSession, type SessionUser } from "@/lib/api/auth";
import { isDemoMode } from "@/lib/api/client";
import { globalRoutes } from "@/lib/product-context";
import { useShellProductContext } from "@/lib/product-context-client";
import { CommandPalette } from "@/components/command/command-palette";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FeedbackProvider, useFeedback } from "@/components/feedback/feedback-provider";
import { projects as demoProjects } from "@/lib/demo/data";
import { getProjectViews, normalizeProjectView, projectViewHref } from "@/features/projects/project-views";
import { LocaleProvider, useI18n } from "@/lib/i18n";

const primaryNav = [
  { label: "工作台", href: globalRoutes.dashboard, icon: Gauge },
  { label: "投标项目", href: globalRoutes.projects, icon: Folder },
  { label: "企业材料库", href: globalRoutes.evidence, icon: Books },
  { label: "全局任务", href: globalRoutes.tasks, icon: CheckSquare },
  { label: "Agent 中心", href: globalRoutes.agent, icon: Robot },
  { label: "审计记录", href: globalRoutes.audit, icon: Scroll },
];

const projectNav = [
  { label: "项目总览", path: "overview", matches: ["overview"], icon: SquaresFour },
  { label: "合规审阅", path: "requirements", matches: ["requirements", "disqualifications", "evidence-matching", "consistency", "amendments"], icon: FileMagnifyingGlass },
  { label: "标书编制", path: "responses", matches: ["responses"], icon: PencilLine },
  { label: "整改交付", path: "tasks", matches: ["tasks", "package", "review"], icon: Package },
  { label: "项目记录", path: "audit", matches: ["audit"], icon: Archive },
];

const demoProjectViews = getProjectViews(demoProjects);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <LocaleProvider>
      <FeedbackProvider>
        {pathname === "/login" ? <main>{children}</main> : <AppShellBody pathname={pathname}>{children}</AppShellBody>}
      </FeedbackProvider>
    </LocaleProvider>
  );
}

function AppShellBody({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const searchParams = useSearchParams();
  const sessionJson = useSyncExternalStore(subscribeSession, sessionSnapshot, () => null);
  const session = sessionJson ? JSON.parse(sessionJson) as SessionUser : demoUser;
  const shellContext = useShellProductContext(pathname);
  const project = shellContext.context;
  const [commandOpen, setCommandOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { notify } = useFeedback();
  const { locale, setLocale, t } = useI18n();
  const pageLabel = t(primaryNav.find((item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)))?.label ?? "招投标工作台");

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const pendingApprovals = shellContext.agent?.approvals.filter((item) => item.status === "pending").length ?? 0;
  const projectSection = pathname.match(/^\/projects\/[^/]+\/([^/]+)/)?.[1] ?? "overview";
  const projectCount = (path: string) => path === "requirements" ? project?.fatalRiskCount : path === "tasks" ? (project?.taskCount ?? 0) + (project?.packageBlockers ?? 0) : undefined;
  const activeProjectView = normalizeProjectView(searchParams.get("view"));

  return (
    <div className="app-shell v4-app-shell">
      <aside className="v4-icon-rail" aria-label={t("主导航")}>
        <Link className="v4-rail-brand" href="/dashboard" aria-label={t("标证通首页")}>
          <Image src="/brand/bidevidence-icon.svg" alt="" width={30} height={30} priority />
        </Link>
        <nav>
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return (
              <Link key={item.href} className={active ? "active" : ""} href={item.href} aria-label={t(item.label)} title={t(item.label)}>
                <Icon size={20} weight={active ? "fill" : "regular"} />
                {item.href === globalRoutes.agent && pendingApprovals > 0 && <i>{pendingApprovals}</i>}
              </Link>
            );
          })}
        </nav>
        <button type="button" aria-label={t("使用帮助")} title={t("使用帮助")} onClick={() => notify({ title: t("演示帮助"), description: t("使用 ⌘K 搜索项目、要求、材料或运行结构化 Agent 动作。"), tone: "info" })}>
          <Question size={20} />
        </button>
      </aside>

      <aside className="v4-context-sidebar" aria-label={project ? t("项目导航") : t("工作区导航")}>
        <Link className="v4-wordmark" href="/dashboard" aria-label="BidEvidence">
          <Image src="/brand/bidevidence-logo.svg" alt="BidEvidence" width={100} height={40} priority />
        </Link>

        {project ? (
          <>
            <button className="v4-project-switcher" type="button" onClick={() => setCommandOpen(true)}>
              <span><small>{t("当前项目")}</small><strong data-preserve-language>{project.name}</strong><em>{project.code}</em></span>
              <CaretDown size={14} />
            </button>
            <div className="v4-project-progress">
              <span><small>{t(project.stage)}</small><strong>{project.deadlineLabel}</strong></span>
              <div><i style={{ width: `${project.project?.progress ?? 58}%` }} /></div>
            </div>
            <p className="v4-side-label">{t("项目工作区")}</p>
            <nav className="v4-side-nav">
              {projectNav.map((item) => {
                const href = `/projects/${project.id}/${item.path}`;
                const Icon = item.icon;
                const count = projectCount(item.path);
                const active = item.matches.includes(projectSection);
                return (
                  <Link key={item.path} className={active ? "active" : ""} href={href}>
                    <Icon size={16} weight={active ? "fill" : "regular"} />
                    <span>{t(item.label)}</span>
                    {typeof count === "number" && count > 0 && <em className={item.path === "requirements" ? "danger" : ""}>{count}</em>}
                  </Link>
                );
              })}
            </nav>
          </>
        ) : (
          <>
            <div className="v4-tenant-context" aria-label={`${t("当前企业")}：上海智园数字科技`}>
              <Buildings size={16} weight="duotone" />
              <span><small>{t("当前企业")}</small><strong data-preserve-language>上海智园数字科技</strong></span>
            </div>
            {pathname.startsWith("/projects") ? (
              <>
                <p className="v4-side-label">{t("已保存视图")}</p>
                <nav className="v4-side-nav v4-saved-views">
                  {demoProjectViews.map((item) => {
                    const active = item.key === activeProjectView;
                    return <Link key={item.key} className={active ? "active" : ""} href={projectViewHref(item.key)} aria-current={active ? "page" : undefined}><CirclesFour size={15} weight={active ? "fill" : "regular"} /><span>{t(item.label)}</span>{isDemoMode && <em>{item.count}</em>}</Link>;
                  })}
                </nav>
              </>
            ) : (
              <>
                <p className="v4-side-label">{t("工作空间")}</p>
                <nav className="v4-side-nav">
                  {primaryNav.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                    return <Link key={item.href} className={active ? "active" : ""} href={item.href}><Icon size={16} weight={active ? "fill" : "regular"} /><span>{t(item.label)}</span></Link>;
                  })}
                </nav>
              </>
            )}
          </>
        )}
      </aside>

      <div className="v4-shell-main">
        <header className="v4-topbar">
          <div className="v4-topbar-context">
            <span>{project ? `${t("项目")} / ${t(project.stage)}` : t("标证通")}</span>
            <strong data-preserve-language={project ? true : undefined}>{project ? project.name : pageLabel}</strong>
          </div>
          <button className="v4-global-search" type="button" aria-label={t("打开全局搜索")} onClick={() => setCommandOpen(true)}>
            <MagnifyingGlass size={15} />
            <span>{t("搜索项目、条款、材料或动作")}</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="v4-topbar-actions">
            <NotificationCenter project={project} />
            <div className="user-menu-wrap">
              <button className="v4-user-button" type="button" aria-expanded={userOpen} onClick={() => setUserOpen((value) => !value)}>
                <span>{session.name.slice(0, 1)}</span><CaretDown size={12} />
              </button>
              {userOpen && (
                <div className="user-popover">
                  <strong>{session.name}</strong>
                  <small>{session.role}</small>
                  <em>{session.source === "demo" ? t("演示会话") : t("API 会话")}</em>
                  <div className="locale-switch" role="group" aria-label={t("界面语言")}>
                    <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>English</button>
                    <button type="button" className={locale === "zh" ? "active" : ""} aria-pressed={locale === "zh"} onClick={() => setLocale("zh")}>中文</button>
                  </div>
                  <a href="https://github.com/shawliu998/Dart" target="_blank" rel="noreferrer">{t("源代码与许可证 · AGPL-3.0")}</a>
                  <button type="button" onClick={() => { setUserOpen(false); setLogoutOpen(true); }}>{t("退出当前会话")}</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="v4-page-content">{children}</main>
      </div>

      <CommandPalette open={commandOpen} project={project} onClose={() => setCommandOpen(false)} />
      <ConfirmDialog open={logoutOpen} title={t("退出当前会话？")} description={t("将退出 {name} 的当前会话，未提交的页面输入可能丢失。", { name: session.name })} confirmLabel={t("确认退出")} tone="danger" onClose={() => setLogoutOpen(false)} onConfirm={() => { clearSession(); window.location.href = "/login"; }} />
    </div>
  );
}
