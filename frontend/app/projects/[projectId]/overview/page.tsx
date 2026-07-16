import Link from "next/link";
import { AlertOctagon, ArrowRight, CalendarClock, Check, CheckCircle2, CircleDot, ClipboardCheck, FileDiff, FileWarning, ListChecks, PackageCheck, Scale, ScrollText, UserRound } from "lucide-react";
import { projectApi } from "@/lib/api/projects";
import { RiskBadge } from "@/components/ui/badges";

const stages = ["文件解析", "要求确认", "证据匹配", "合规审查", "整改", "文件封装", "提交准备"];

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await projectApi.get(projectId);
  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title-group"><span className="project-code">{project.projectCode}</span><h1>{project.name}</h1><p>{project.buyerName} · 预算 ¥5,900,000 · 负责人 {project.owner}</p></div>
        <div className="header-actions"><Link className="button" href={`/projects/${projectId}/disqualifications`}><FileWarning size={15} />查看否决项</Link><Link className="button primary" href={`/projects/${projectId}/requirements`}>继续要求确认<ArrowRight size={15} /></Link></div>
      </header>

      <section className="panel stage-panel" aria-label="项目阶段">
        <div className="stage-heading"><span><strong>当前阶段：要求确认</strong><small>请在进入证据匹配前完成高风险条款复核</small></span><span>整体完成度 <strong>42%</strong></span></div>
        <ol className="stage-stepper">{stages.map((stage, index) => <li key={stage} className={index < 1 ? "done" : index === 1 ? "current" : ""}><span>{index < 1 ? <Check size={13} /> : index + 1}</span><strong>{stage}</strong><small>{["已完成", "进行中", "待开始", "待开始", "待开始", "待开始", "待开始"][index]}</small></li>)}</ol>
      </section>

      <section className="overview-metrics" aria-label="合规概况">
        <OverviewMetric label="总要求" value="20" note="已人工确认 6 条" icon={<ListChecks size={16} />} />
        <OverviewMetric label="否决项" value="3" note="1 项规则命中" icon={<AlertOctagon size={16} />} tone="fatal" />
        <OverviewMetric label="已满足" value="10" note="50% 已有充分证据" icon={<CheckCircle2 size={16} />} tone="success" />
        <OverviewMetric label="缺少证据" value="4" note="2 项需要今天处理" icon={<CircleDot size={16} />} tone="warning" />
        <OverviewMetric label="文件冲突" value="2" note="主体与响应时间" icon={<FileDiff size={16} />} tone="warning" />
        <OverviewMetric label="待整改" value="7" note="2 项即将到期" icon={<ClipboardCheck size={16} />} />
      </section>

      <div className="overview-grid">
        <section className="panel workflow-panel">
          <div className="panel-header"><div><h2>合规交付工作流</h2><p>从证据匹配到最终封装的当前处理状态</p></div></div>
          <div className="workflow-links"><Link href={`/projects/${projectId}/evidence-matching`}><Scale size={16} /><span><strong>证据匹配</strong><small>4 个要求待确认</small></span><em>2 个高分候选</em><ArrowRight size={13} /></Link><Link href={`/projects/${projectId}/consistency`}><FileDiff size={16} /><span><strong>一致性检查</strong><small>金额、主体、承诺</small></span><em className="danger-text">3 个未解决</em><ArrowRight size={13} /></Link><Link href={`/projects/${projectId}/tasks`}><ClipboardCheck size={16} /><span><strong>整改任务</strong><small>责任人和截止时间</small></span><em>6 个进行中</em><ArrowRight size={13} /></Link><Link href={`/projects/${projectId}/package`}><PackageCheck size={16} /><span><strong>文件封装</strong><small>最终目录与校验</small></span><em className="danger-text">2 个阻塞</em><ArrowRight size={13} /></Link><Link href={`/projects/${projectId}/audit`}><ScrollText size={16} /><span><strong>审计记录</strong><small>模型、规则与人工操作</small></span><em>7 条新事件</em><ArrowRight size={13} /></Link></div>
        </section>
        <section className="panel risk-focus">
          <div className="panel-header"><div><h2>最高优先级风险</h2><p>按致命性、截止时间和证据缺口排序</p></div><Link href={`/projects/${projectId}/disqualifications`}>查看全部 <ArrowRight size={13} /></Link></div>
          <div className="risk-list"><RiskRow title="投标报价超过最高限价 10,000 元" source="招标文件.pdf · 第 8 页 · 2.1.4" owner="王琳" due="07-18" /><RiskRow title="ISO 27001 证书在截止日前已过期" source="招标文件.pdf · 第 21 页 · 4.2.3" owner="赵一舟" due="07-19" /><RiskRow title="投标函签章清晰度不足，需人工复核" source="招标文件.pdf · 第 12 页 · 3.1.1" owner="刘敏" due="07-20" review /></div>
        </section>

        <section className="panel deadline-card">
          <div className="panel-header"><div><h2>关键时间</h2><p>基于补充公告 01 更新</p></div><CalendarClock size={18} /></div>
          <div className="countdown-block"><span>距离投标截止</span><strong>13 天 18 小时</strong><small>2026-07-30 09:30 · Asia/Shanghai</small></div>
          <div className="milestone-list"><p><span>07-18</span><strong>内部报价冻结</strong><em>2 天后</em></p><p><span>07-22</span><strong>合规复核完成</strong><em>6 天后</em></p><p><span>07-28</span><strong>封装包终审</strong><em>12 天后</em></p></div>
        </section>

        <section className="panel activity-panel">
          <div className="panel-header"><div><h2>最近活动</h2><p>模型运行与人工操作均追加记录</p></div><span className="audit-label">可审计</span></div>
          <ol className="activity-list"><Activity name="刘敏" text="确认了 2 条招标要求" time="14:26" /><Activity name="规则引擎" text="发现投标报价超过最高限价" time="14:18" system /><Activity name="赵一舟" text="上传 ISO 27001 续证受理证明" time="13:42" /><Activity name="解析任务" text="完成补充公告 01 页码级解析" time="11:08" system /></ol>
        </section>

        <section className="panel owners-panel">
          <div className="panel-header"><div><h2>责任人与阻塞任务</h2><p>当前阶段需要协作的事项</p></div><UserRound size={17} /></div>
          <div className="owner-list"><p><span className="avatar">王</span><span><strong>王琳 · 商务</strong><small>复核并统一四份报价文件</small></span><em>今天到期</em></p><p><span className="avatar">赵</span><span><strong>赵一舟 · 资质</strong><small>补齐有效 ISO 27001 证明</small></span><em>明天到期</em></p><p><span className="avatar">周</span><span><strong>周扬 · 技术</strong><small>应用补充公告参数变更</small></span><em>07-22</em></p></div>
        </section>
      </div>
    </div>
  );
}

function OverviewMetric({ label, value, note, icon, tone = "" }: { label: string; value: string; note: string; icon: React.ReactNode; tone?: string }) { return <article className={`overview-metric ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>; }
function RiskRow({ title, source, owner, due, review = false }: { title: string; source: string; owner: string; due: string; review?: boolean }) { return <article><RiskBadge level={review ? "high" : "fatal"} /><div><strong>{title}</strong><small>{source}</small></div><span><small>负责人</small>{owner}</span><span><small>截止</small>{due}</span></article>; }
function Activity({ name, text, time, system = false }: { name: string; text: string; time: string; system?: boolean }) { return <li><span className={system ? "activity-dot system" : "activity-dot"} /><div><strong>{name}</strong><p>{text}</p></div><time>{time}</time></li>; }
