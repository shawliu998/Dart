"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  CalendarClock,
  Check,
  ChevronRight,
  FileText,
  Grid2X2,
  List,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { phaseApi } from "@/lib/api/phase2";
import { DataUnavailableState } from "@/components/feedback/data-unavailable-state";
import {
  MutationFeedback,
  type MutationResult,
} from "@/components/feedback/mutation-feedback";
import type { DataSource, RemediationTask } from "@/lib/phase-data/types";

const columns: { key: RemediationTask["status"]; label: string }[] = [
  { key: "todo", label: "待处理" },
  { key: "in_progress", label: "进行中" },
  { key: "review", label: "待复核" },
  { key: "done", label: "已完成" },
];
const priorityLabel = { critical: "致命", high: "高", medium: "中", low: "低" };
const nextStatus: Record<RemediationTask["status"], RemediationTask["status"]> =
  {
    todo: "in_progress",
    in_progress: "review",
    review: "done",
    done: "in_progress",
  };

export function TaskCenter({
  projectId,
  initialTasks,
  source,
  loadError,
}: {
  projectId: string;
  initialTasks: RemediationTask[];
  source: DataSource;
  loadError?: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [selectedId, setSelectedId] = useState(initialTasks[0]?.id);
  const [dragId, setDragId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const selected = tasks.find((item) => item.id === selectedId) ?? tasks[0];
  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          `${task.title}${task.owner}${task.sourceLabel}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (priority === "all" || task.priority === priority),
      ),
    [priority, query, tasks],
  );

  async function moveTask(id: string, status: RemediationTask["status"]) {
    const currentTask = tasks.find((task) => task.id === id);
    if (!currentTask) return;
    if (nextStatus[currentTask.status] !== status) {
      setFeedback({
        source,
        persisted: false,
        status: "error",
        title: "状态流转被阻止",
        message: `任务必须按“待处理 → 进行中 → 待复核 → 已完成”流转；当前不能从 ${columns.find((item) => item.key === currentTask.status)?.label} 直接进入 ${columns.find((item) => item.key === status)?.label}。`,
      });
      return;
    }
    const result =
      status === "review"
        ? await phaseApi.completeTask(id)
        : status === "done"
          ? await phaseApi.reviewTask(id)
          : await phaseApi.updateTask(
              id,
              { status },
              `看板移动：${currentTask.status} → ${status}`,
            );
    setFeedback(toFeedback(result, source, "任务状态已更新"));
    if (result.failed) return;
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, status } : task)),
    );
  }
  async function createTask() {
    if (!newTitle.trim()) return;
    const draft: RemediationTask = {
      id: `TASK-DEMO-${Date.now()}`,
      title: newTitle,
      priority: "medium",
      status: "todo",
      owner: "刘敏",
      reviewer: "未分配",
      dueDate: "2026-07-24",
      sourceType: "requirement",
      sourceLabel: "人工创建 · 当前项目",
      reason: "由投标经理手动创建",
      evidence: "待补充",
      steps: ["补充处理说明", "上传完成证明"],
      attachments: 0,
      comments: 0,
    };
    const result = await phaseApi.createTask(
      projectId,
      { ...draft, sourceType: "manual" as RemediationTask["sourceType"] },
      projectId,
    );
    setFeedback(toFeedback(result, source, "任务已创建"));
    if (result.failed) return;
    setTasks((current) => [draft, ...current]);
    setSelectedId(draft.id);
    setNewTitle("");
    setCreateOpen(false);
  }
  if (loadError) {
    return <DataUnavailableState title="整改任务 API 数据不可用" message={loadError} />;
  }
  if (!selected) return null;
  return (
    <div className="page task-page">
      <header className="page-header">
        <div className="page-title-group">
          <h1>整改任务</h1>
          <p>
            每个任务都关联要求、否决项、冲突、公告变化或封装问题，并保留完整来源链。
          </p>
        </div>
        <div className="header-actions">
          <span className={`data-source ${source}`}>
            {source === "api" ? "API 数据" : "本地演示数据"}
          </span>
          <button
            className="button primary"
            type="button"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} />
            新建任务
          </button>
        </div>
      </header>
      <section className="task-overview">
        <article>
          <AlertOctagon size={15} />
          <span>
            <strong>
              {
                tasks.filter(
                  (item) =>
                    item.priority === "critical" && item.status !== "done",
                ).length
              }
            </strong>
            <small>致命优先级</small>
          </span>
        </article>
        <article>
          <CalendarClock size={15} />
          <span>
            <strong>
              {
                tasks.filter(
                  (item) =>
                    item.dueDate <= "2026-07-19" && item.status !== "done",
                ).length
              }
            </strong>
            <small>3 天内到期</small>
          </span>
        </article>
        <article>
          <Check size={15} />
          <span>
            <strong>
              {tasks.filter((item) => item.status === "done").length}
            </strong>
            <small>已完成</small>
          </span>
        </article>
        <div className="task-toolbar">
          <label>
            <Search size={13} />
            <input
              aria-label="搜索整改任务"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索任务、负责人、来源"
            />
          </label>
          <select
            aria-label="按优先级筛选"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="all">全部优先级</option>
            <option value="critical">致命</option>
            <option value="high">高</option>
            <option value="medium">中</option>
          </select>
          <span className="view-toggle">
            <button
              className={view === "kanban" ? "active" : ""}
              type="button"
              aria-label="Kanban 视图"
              onClick={() => setView("kanban")}
            >
              <Grid2X2 size={14} />
            </button>
            <button
              className={view === "table" ? "active" : ""}
              type="button"
              aria-label="表格视图"
              onClick={() => setView("table")}
            >
              <List size={14} />
            </button>
          </span>
        </div>
      </section>
      <MutationFeedback result={feedback} />
      <div className="task-layout">
        <section className="panel task-board">
          {view === "kanban" ? (
            <div className="kanban-board">
              {columns.map((column) => (
                <section
                  key={column.key}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragId) void moveTask(dragId, column.key);
                    setDragId(null);
                  }}
                >
                  <header>
                    <strong>{column.label}</strong>
                    <span>
                      {
                        filtered.filter((task) => task.status === column.key)
                          .length
                      }
                    </span>
                  </header>
                  <div>
                    {filtered
                      .filter((task) => task.status === column.key)
                      .map((task) => (
                        <article
                          key={task.id}
                          draggable
                          onDragStart={() => setDragId(task.id)}
                          onDragEnd={() => setDragId(null)}
                          className={task.id === selected.id ? "selected" : ""}
                          onClick={() => setSelectedId(task.id)}
                        >
                          <span className={`task-priority ${task.priority}`}>
                            {priorityLabel[task.priority]}优先级
                          </span>
                          <strong>{task.title}</strong>
                          <small>{task.sourceLabel}</small>
                          <footer>
                            <span>
                              <UserRound size={11} />
                              {task.owner}
                            </span>
                            <span>
                              <CalendarClock size={11} />
                              {task.dueDate.slice(5)}
                            </span>
                          </footer>
                        </article>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="task-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>任务</th>
                    <th>优先级</th>
                    <th>状态</th>
                    <th>来源</th>
                    <th>负责人</th>
                    <th>复核人</th>
                    <th>截止</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((task) => (
                    <tr key={task.id} onClick={() => setSelectedId(task.id)}>
                      <td>
                        <strong>{task.title}</strong>
                      </td>
                      <td>
                        <span className={`task-priority ${task.priority}`}>
                          {priorityLabel[task.priority]}
                        </span>
                      </td>
                      <td>
                        {
                          columns.find((item) => item.key === task.status)
                            ?.label
                        }
                      </td>
                      <td>{task.sourceLabel}</td>
                      <td>{task.owner}</td>
                      <td>{task.reviewer}</td>
                      <td>{task.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="panel task-detail">
          <header>
            <div>
              <span>{selected.id}</span>
              <h2>{selected.title}</h2>
            </div>
            <span className={`task-priority ${selected.priority}`}>
              {priorityLabel[selected.priority]}优先级
            </span>
          </header>
          <section className="task-source-chain">
            <h3>来源链</h3>
            <Link href={taskSourceHref(projectId, selected)}>
              <FileText size={14} />
              <span>
                <strong>{selected.sourceLabel}</strong>
                <small>{selected.evidence}</small>
              </span>
              <ChevronRight size={13} />
            </Link>
          </section>
          <section aria-label="任务状态链">
            <h3>状态链</h3>
            <div className="active-filters">
              {columns.map((column, index) => (
                <span
                  key={column.key}
                  className={column.key === selected.status ? "owner-chip" : ""}
                >
                  {index + 1}. {column.label}
                </span>
              ))}
            </div>
          </section>
          <dl className="task-meta">
            <div>
              <dt>负责人</dt>
              <dd>{selected.owner}</dd>
            </div>
            <div>
              <dt>复核人</dt>
              <dd>{selected.reviewer}</dd>
            </div>
            <div>
              <dt>截止时间</dt>
              <dd>{selected.dueDate}</dd>
            </div>
            <div>
              <dt>当前状态</dt>
              <dd>
                {columns.find((item) => item.key === selected.status)?.label}
              </dd>
            </div>
          </dl>
          <section>
            <h3>整改原因</h3>
            <p>{selected.reason}</p>
          </section>
          <section>
            <h3>建议步骤</h3>
            <ol>
              {selected.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
          <div className="task-assets">
            <span>
              <Paperclip size={12} />
              {selected.attachments} 个附件
            </span>
            <span>
              <MessageSquare size={12} />
              {selected.comments} 条评论
            </span>
          </div>
          <footer>
            {selected.status !== "done" ? (
              <button
                className="button primary full-width"
                type="button"
                onClick={() =>
                  moveTask(selected.id, nextStatus[selected.status])
                }
              >
                <Check size={13} />
                {selected.status === "todo"
                  ? "开始处理"
                  : selected.status === "in_progress"
                    ? "提交复核"
                    : "复核并完成"}
              </button>
            ) : (
              <button
                className="button full-width"
                type="button"
                onClick={() => moveTask(selected.id, "in_progress")}
              >
                重新打开任务
              </button>
            )}
          </footer>
        </aside>
      </div>
      {createOpen && (
        <div className="dialog-backdrop">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
          >
            <div className="dialog-title">
              <div>
                <h2 id="create-task-title">新建整改任务</h2>
                <p>人工任务会绑定当前项目，创建后可继续补充来源。</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setCreateOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
            <label className="form-field">
              <span>
                任务标题 <em>必填</em>
              </span>
              <input
                autoFocus
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="描述可验证的整改结果"
              />
            </label>
            <div className="dialog-actions">
              <button
                className="button"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="button"
                disabled={!newTitle.trim()}
                onClick={createTask}
              >
                创建任务
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function toFeedback(
  result: { message: string; persisted: boolean; failed?: boolean },
  source: DataSource,
  title: string,
): MutationResult {
  return {
    source,
    persisted: result.persisted,
    status: result.failed ? "error" : result.persisted ? "success" : "warning",
    title,
    message: result.message,
  };
}
function taskSourceHref(projectId: string, task: RemediationTask) {
  const route =
    task.sourceType === "agent_ocr_required"
      ? "overview"
      : task.sourceType === "agent_compliance_check" || task.sourceType === "evidence"
        ? "evidence-matching"
        : task.sourceType === "agent_response_gap"
          ? "responses"
          : task.sourceType === "consistency"
      ? "consistency"
      : task.sourceType === "amendment"
        ? "amendments"
        : task.sourceType === "package"
          ? "package"
          : task.sourceType === "disqualification"
            ? "disqualifications"
            : "requirements";
  return `/projects/${projectId}/${route}?source=${encodeURIComponent(task.sourceLabel)}&task=${encodeURIComponent(task.id)}`;
}
