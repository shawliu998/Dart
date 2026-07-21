import Link from "next/link";
import { ArrowUpRight, Bot, CalendarClock, ShieldCheck } from "lucide-react";

import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { AgentLaunchPanel } from "@/components/agent/agent-launch-panel";
import { agentApi } from "@/lib/api/agent";
import { projectApi } from "@/lib/api/projects";
import { resolveAgentProjectId } from "@/lib/agent";

const riskLabels = { fatal: "阻断项", high: "高风险", medium: "中风险", low: "低风险" } as const;

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ project?: string | string[] }> }) {
  const query = await searchParams;
  const projectId = resolveAgentProjectId(query.project);
  if (!projectId) {
    const projects = await projectApi.list();
    return (
      <div className="v4-agent-directory">
        <header className="v4-directory-head">
          <div>
            <span className="v4-page-eyebrow">AUTONOMOUS WORKSPACE</span>
            <h1>项目 Agent</h1>
            <p>选择一个项目，继续已有运行或创建新的受控分析任务。</p>
          </div>
          <span className="v4-agent-count"><Bot size={14} aria-hidden="true" />{projects.length} 个可执行项目</span>
        </header>

        <section className="v4-agent-project-card" aria-labelledby="agent-project-list-title">
          <div className="v4-agent-project-head">
            <div><h2 id="agent-project-list-title">项目队列</h2><p>按最近更新排序，风险与截止时间来自项目数据。</p></div>
            <Link href="/projects">查看全部项目<ArrowUpRight size={13} aria-hidden="true" /></Link>
          </div>
          {projects.length ? (
            <div className="v4-agent-project-list">
              {projects.map((project) => (
                <Link className="v4-agent-project-row" href={`/agent?project=${project.id}`} key={project.id}>
                  <span className="v4-agent-project-mark">{project.name.slice(0, 1)}</span>
                  <span className="v4-agent-project-copy">
                    <strong>{project.name}</strong>
                    <small>{project.projectCode} · {project.buyerName}</small>
                  </span>
                  <span className="v4-agent-project-stage"><i />{project.stage}</span>
                  <span className="v4-agent-project-progress"><i><b style={{ width: `${project.progress}%` }} /></i>{project.progress}%</span>
                  <span className={`v4-agent-risk ${project.risk}`}>{riskLabels[project.risk]} · {project.highRiskCount}</span>
                  <span className="v4-agent-deadline"><CalendarClock size={13} aria-hidden="true" />{project.deadline}</span>
                  <span className="v4-agent-open">打开 Agent<ArrowUpRight size={13} aria-hidden="true" /></span>
                </Link>
              ))}
            </div>
          ) : <div className="v4-project-empty"><strong>暂无可执行项目</strong><p>先创建项目并导入招标文件，再启动 Agent。</p></div>}
        </section>

        <aside className="v4-agent-boundary">
          <ShieldCheck size={15} aria-hidden="true" />
          <span><strong>受控执行边界</strong> Agent 只生成内部候选与草稿；金额、日期、数量及最终合规状态仍由规则和人工复核决定。</span>
        </aside>
      </div>
    );
  }
  const result = await agentApi.getRun(projectId);
  return <div className="v4-agent-page"><AgentLaunchPanel projectId={projectId} /><AgentWorkspace initialResult={result} /></div>;
}
