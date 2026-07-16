"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertOctagon, CalendarDays, CheckSquare2, Clock3, Grid2X2, List, Plus, Search, SlidersHorizontal } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress";
import { RiskBadge } from "@/components/ui/badges";
import type { Project } from "@/lib/types";

export function ProjectList({ initialProjects }: { initialProjects: Project[] }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [risk, setRisk] = useState("all");
  const [view, setView] = useState<"table" | "card">("table");

  const filtered = useMemo(() => initialProjects.filter((project) => {
    const textMatch = `${project.name}${project.buyerName}${project.projectCode}`.toLowerCase().includes(query.toLowerCase());
    return textMatch && (stage === "all" || project.stage === stage) && (risk === "all" || project.risk === risk);
  }), [initialProjects, query, risk, stage]);

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title-group"><h1>投标项目</h1><p>集中管理项目阶段、证据完备度与截止风险。</p></div>
        <Link className="button primary" href="/projects/new"><Plus size={16} />新建项目</Link>
      </header>

      <section className="stats-grid" aria-label="项目统计">
        <Stat icon={<CheckSquare2 size={15} />} label="进行中项目" value="3" note="较上周新增 1 个" />
        <Stat icon={<CalendarDays size={15} />} label="7 天内截止" value="1" note="需优先处理" />
        <Stat fatal icon={<AlertOctagon size={15} />} label="致命风险" value="3" note="集中于 1 个项目" />
        <Stat icon={<Clock3 size={15} />} label="待我处理" value="7" note="2 项今天到期" />
        <Stat icon={<CheckSquare2 size={15} />} label="待审批封装包" value="1" note="等待负责人审批" />
      </section>

      <section className="panel" aria-label="项目列表">
        <div className="toolbar">
          <label className="search-field"><Search size={15} /><span className="sr-only">搜索项目</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目名称、采购人、编号" /></label>
          <select className="select-field" aria-label="按阶段筛选" value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">全部阶段</option><option>要求确认</option><option>证据匹配</option><option>文件封装</option></select>
          <select className="select-field" aria-label="按风险筛选" value={risk} onChange={(event) => setRisk(event.target.value)}><option value="all">全部风险</option><option value="fatal">致命风险</option><option value="high">高风险</option><option value="low">低风险</option></select>
          <button type="button" className="button small" onClick={() => { setQuery(""); setStage("all"); setRisk("all"); }}><SlidersHorizontal size={14} />重置筛选</button>
          <span className="toolbar-spacer" />
          <span className="result-count">{filtered.length} 个项目</span>
          <div className="view-toggle" aria-label="视图切换">
            <button type="button" className={view === "table" ? "active" : ""} aria-label="表格视图" aria-pressed={view === "table"} onClick={() => setView("table")}><List size={15} /></button>
            <button type="button" className={view === "card" ? "active" : ""} aria-label="卡片视图" aria-pressed={view === "card"} onClick={() => setView("card")}><Grid2X2 size={15} /></button>
          </div>
        </div>

        {filtered.length === 0 ? <div className="empty-state"><strong>没有匹配的项目</strong>请调整筛选条件或重置筛选。</div> : view === "table" ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>项目名称</th><th>当前阶段</th><th>完成度</th><th>风险</th><th>高风险项</th><th>整改任务</th><th>截止时间</th><th>负责人</th><th>更新时间</th></tr></thead>
              <tbody>{filtered.map((project) => <tr key={project.id}>
                <td><Link className="project-cell" href={`/projects/${project.id}/overview`}><strong>{project.name}</strong><span>{project.projectCode} · {project.buyerName}</span></Link></td>
                <td><span className="stage-label">{project.stage}</span></td>
                <td><ProgressBar value={project.progress} /></td>
                <td><RiskBadge level={project.risk} /></td>
                <td><strong className={project.highRiskCount ? "danger-text" : "success-text"}>{project.highRiskCount}</strong></td>
                <td>{project.taskCount}</td><td>{project.deadline}</td><td>{project.owner}</td><td className="muted-text">{project.updatedAt}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <div className="project-card-grid">{filtered.map((project) => <Link key={project.id} className="project-card" href={`/projects/${project.id}/overview`}><div className="project-card-head"><span className="stage-label">{project.stage}</span><RiskBadge level={project.risk} /></div><h2>{project.name}</h2><p>{project.projectCode} · {project.buyerName}</p><ProgressBar value={project.progress} /><dl><div><dt>高风险项</dt><dd>{project.highRiskCount}</dd></div><div><dt>整改任务</dt><dd>{project.taskCount}</dd></div><div><dt>负责人</dt><dd>{project.owner}</dd></div></dl><span className="project-deadline"><CalendarDays size={14} />{project.deadline} 截止</span></Link>)}</div>}
      </section>
    </div>
  );
}

function Stat({ icon, label, value, note, fatal = false }: { icon: React.ReactNode; label: string; value: string; note: string; fatal?: boolean }) {
  return <article className={fatal ? "stat-card fatal" : "stat-card"}><div className="stat-card-top"><span>{label}</span><span className="stat-card-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></article>;
}
