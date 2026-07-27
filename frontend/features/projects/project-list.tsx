"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CaretDown,
  Clock,
  DotsThree,
  FunnelSimple,
  MagnifyingGlass,
  Plus,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { ProgressBar } from "@/components/ui/progress";
import { RiskBadge } from "@/components/ui/badges";
import type { Project } from "@/lib/types";
import { DEMO_NOW } from "@/lib/product-context";
import { getProjectViews, isProjectInView, isDueSoon, normalizeProjectView, type ProjectView } from "@/features/projects/project-views";

export function ProjectList({ initialProjects, source }: { initialProjects: Project[]; source: "api" | "demo" }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [risk, setRisk] = useState("all");
  const view = normalizeProjectView(searchParams.get("view"));
  const referenceNow = useMemo(() => source === "demo" ? DEMO_NOW : new Date(), [source]);

  const selectView = (nextView: ProjectView) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (nextView === "active") nextSearchParams.delete("view");
    else nextSearchParams.set("view", nextView);
    const queryString = nextSearchParams.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const filtered = useMemo(() => initialProjects.filter((project) => {
    const textMatch = `${project.name}${project.buyerName}${project.projectCode}`.toLowerCase().includes(query.toLowerCase());
    const viewMatch = isProjectInView(project, view, referenceNow);
    return textMatch && viewMatch && (stage === "all" || project.stage === stage) && (risk === "all" || project.risk === risk);
  }), [initialProjects, query, referenceNow, risk, stage, view]);

  const filtersActive = Boolean(query) || stage !== "all" || risk !== "all";
  const views = getProjectViews(initialProjects, referenceNow);

  return (
    <div className="v4-project-page">
      <header className="v4-directory-head">
        <div>
          <h1>项目</h1>
          <p>查看投标进度、合规状态与待办事项</p>
        </div>
        <div>
          <span className={`data-source ${source}`}>{source === "demo" ? "确定性演示" : "本地 API"}</span>
          <Link className="v4-primary-button" href="/projects/new"><Plus size={15} weight="bold" />新建项目</Link>
        </div>
      </header>

      <nav className="v4-directory-tabs" aria-label="项目视图">
        {views.map((item) => <button key={item.key} type="button" className={view === item.key ? "active" : ""} aria-pressed={view === item.key} onClick={() => selectView(item.key)}>{item.label}<span>{item.count}</span></button>)}
      </nav>

      <section className="v4-project-toolbar" aria-label="项目筛选">
        <label className="v4-project-search">
          <MagnifyingGlass size={15} />
          <span className="sr-only">搜索项目</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、采购人或编号" />
        </label>
        <label className="v4-compact-select"><FunnelSimple size={14} /><select aria-label="按阶段筛选" value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">全部阶段</option><option>要求确认</option><option>证据匹配</option><option>文件封装</option></select><CaretDown size={12} /></label>
        <label className="v4-compact-select"><select aria-label="按风险筛选" value={risk} onChange={(event) => setRisk(event.target.value)}><option value="all">全部风险</option><option value="fatal">阻断项</option><option value="high">高风险</option><option value="medium">中风险</option><option value="low">低风险</option></select><CaretDown size={12} /></label>
        {filtersActive && <button className="v4-clear-filter" type="button" onClick={() => { setQuery(""); setStage("all"); setRisk("all"); }}><SlidersHorizontal size={14} />清除</button>}
        <span className="v4-result-count">共 {filtered.length} 个项目</span>
      </section>

      <section className="v4-project-table-card" aria-label="项目列表">
        {filtered.length === 0 ? (
          <div className="v4-project-empty"><strong>没有匹配的项目</strong><p>调整筛选条件后重试。</p></div>
        ) : (
          <div className="v4-project-table-wrap">
            <table className="v4-project-table">
              <thead><tr><th>项目名称</th><th>当前阶段</th><th>进度</th><th>风险</th><th>待处理</th><th>截止时间</th><th>负责人</th><th>最后更新</th><th aria-label="操作" /></tr></thead>
              <tbody>{filtered.map((project) => (
                <tr key={project.id}>
                  <td><Link className="v4-project-name" href={`/projects/${project.id}/overview`}><span>{project.name.slice(0, 1)}</span><div><strong>{project.name}</strong><small>{project.projectCode} · {project.buyerName}</small></div></Link></td>
                  <td><span className="v4-stage-dot"><i />{project.stage}</span></td>
                  <td><div className="v4-progress-cell"><ProgressBar value={project.progress} /><small>{project.progress}%</small></div></td>
                  <td><RiskBadge level={project.risk} /></td>
                  <td><strong className={project.highRiskCount || project.taskCount ? "v4-attention-count" : ""}>{project.highRiskCount + project.taskCount}</strong></td>
                  <td><span className={isDueSoon(project, referenceNow) ? "v4-due-soon" : "v4-deadline"}><Clock size={13} />{project.deadline}</span></td>
                  <td><span className="v4-owner"><i>{project.owner.slice(0, 1)}</i>{project.owner}</span></td>
                  <td className="v4-updated">{project.updatedAt}</td>
                  <td><Link className="v4-row-action" aria-label={`打开 ${project.name}`} href={`/projects/${project.id}/overview`}><DotsThree size={18} weight="bold" /></Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
