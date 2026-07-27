"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  FileText,
  Grid2X2,
  List,
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

const priorityLabel = {
  critical: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

const nextStatus: Record<RemediationTask["status"], RemediationTask["status"]> =
  {
    todo: "in_progress",
    in_progress: "review",
    review: "done",
    done: "in_progress",
  };

const nextActionLabel: Record<RemediationTask["status"], string> = {
  todo: "开始处理",
  in_progress: "提交复核",
  review: "复核并完成",
  done: "重新打开",
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
  const [view, setView] = useState<"list" | "flow">("list");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState(initialTasks[0]?.id);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [dragId, setDragId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          `${task.title}${task.owner}${task.reviewer}${task.sourceLabel}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (priority === "all" || task.priority === priority) &&
          (status === "all" || task.status === status),
      ),
    [priority, query, status, tasks],
  );

  const selected =
    filtered.find((item) => item.id === selectedId) ??
    filtered[0] ??
    tasks.find((item) => item.id === selectedId) ??
    tasks[0];

  const openCount = tasks.filter((item) => item.status !== "done").length;
  const reviewCount = tasks.filter((item) => item.status === "review").length;
  const filtersActive = Boolean(
    query || priority !== "all" || status !== "all",
  );

  function selectTask(id: string) {
    setSelectedId(id);
    setMobileView("detail");
  }

  function clearFilters() {
    setQuery("");
    setPriority("all");
    setStatus("all");
  }

  async function moveTask(id: string, targetStatus: RemediationTask["status"]) {
    const currentTask = tasks.find((task) => task.id === id);
    if (!currentTask) return;
    if (nextStatus[currentTask.status] !== targetStatus) {
      setFeedback({
        source,
        persisted: false,
        status: "error",
        title: "状态流转被阻止",
        message: `任务必须按“待处理 → 进行中 → 待复核 → 已完成”流转；当前不能从 ${statusLabel(currentTask.status)} 直接进入 ${statusLabel(targetStatus)}。`,
      });
      return;
    }

    const result =
      targetStatus === "review"
        ? await phaseApi.completeTask(id)
        : targetStatus === "done"
          ? await phaseApi.reviewTask(id)
          : await phaseApi.updateTask(
              id,
              { status: targetStatus },
              `任务流转：${currentTask.status} → ${targetStatus}`,
            );

    setFeedback(toFeedback(result, source, "任务状态已更新"));
    if (result.failed) return;
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, status: targetStatus } : task,
      ),
    );
  }

  async function createTask() {
    if (!newTitle.trim()) return;
    const draft: RemediationTask = {
      id: `TASK-DEMO-${Date.now()}`,
      title: newTitle.trim(),
      priority: "medium",
      status: "todo",
      owner: "刘敏",
      reviewer: "未分配",
      dueDate: "2026-07-24",
      sourceType: "manual",
      sourceLabel: "人工创建 · 当前项目",
      reason: "由投标经理手动创建",
      evidence: "待补充",
      steps: ["补充处理说明", "提交复核"],
      attachments: 0,
      comments: 0,
    };
    const result = await phaseApi.createTask(projectId, draft, projectId);
    setFeedback(toFeedback(result, source, "任务已创建"));
    if (result.failed) return;
    const created = { ...draft, id: result.data.id || draft.id };
    setTasks((current) => [created, ...current]);
    setSelectedId(created.id);
    setMobileView("detail");
    setNewTitle("");
    setCreateOpen(false);
  }

  if (loadError) {
    return (
      <DataUnavailableState
        title="整改任务 API 数据不可用"
        message={loadError}
      />
    );
  }

  return (
    <div className="page task-page batch03-task-page">
      <header className="page-header task-page-header">
        <div className="page-title-group">
          <h1>整改任务</h1>
          <p>负责人处理整改项并提交复核，复核人沿同一来源链完成确认。</p>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={14} />
          新建任务
        </button>
      </header>

      <section className="task-commandbar" aria-label="整改任务工具栏">
        <label className="task-search-field">
          <Search size={14} />
          <input
            aria-label="搜索整改任务"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任务、负责人、复核人或来源"
          />
        </label>
        <label className="task-filter-field">
          <span>优先级</span>
          <select
            aria-label="按优先级筛选"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="all">全部</option>
            <option value="critical">紧急</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </label>
        <label className="task-filter-field">
          <span>状态</span>
          <select
            aria-label="按状态筛选"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">全部</option>
            {columns.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <div className="task-command-summary" aria-label="任务概况">
          <strong>{filtered.length}</strong> 项<span>{openCount} 项未完成</span>
          <span>{reviewCount} 项待复核</span>
        </div>
        {filtersActive && (
          <button
            className="task-clear-filters"
            type="button"
            onClick={clearFilters}
          >
            清除筛选
          </button>
        )}
        <div className="task-view-toggle" aria-label="任务视图">
          <button
            className={view === "list" ? "active" : ""}
            type="button"
            aria-label="工作清单"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={14} />
            清单
          </button>
          <button
            className={view === "flow" ? "active" : ""}
            type="button"
            aria-label="流程视图"
            aria-pressed={view === "flow"}
            onClick={() => setView("flow")}
          >
            <Grid2X2 size={14} />
            流程
          </button>
        </div>
      </section>

      <MutationFeedback result={feedback} />

      <div className="task-mobile-switch" aria-label="移动端任务视图">
        <button
          className={mobileView === "list" ? "active" : ""}
          type="button"
          aria-pressed={mobileView === "list"}
          onClick={() => setMobileView("list")}
        >
          任务列表
        </button>
        <button
          className={mobileView === "detail" ? "active" : ""}
          type="button"
          disabled={!selected}
          aria-pressed={mobileView === "detail"}
          onClick={() => setMobileView("detail")}
        >
          任务详情
        </button>
      </div>

      <div className={`task-workspace mobile-${mobileView}`}>
        <section className="task-worklist" aria-label="整改任务列表">
          {filtered.length === 0 ? (
            <div className="task-empty">
              <strong>没有符合条件的任务</strong>
              <p>调整搜索或筛选条件，查看其他整改任务。</p>
              {filtersActive && (
                <button className="button" type="button" onClick={clearFilters}>
                  清除筛选
                </button>
              )}
            </div>
          ) : view === "list" ? (
            <TaskList
              tasks={filtered}
              selectedId={selected?.id}
              onSelect={selectTask}
            />
          ) : (
            <TaskFlow
              tasks={filtered}
              selectedId={selected?.id}
              dragId={dragId}
              onSelect={selectTask}
              onDragStart={setDragId}
              onDragEnd={() => setDragId(null)}
              onDrop={(targetStatus) => {
                if (dragId) void moveTask(dragId, targetStatus);
                setDragId(null);
              }}
            />
          )}
        </section>

        <aside className="task-inspector" aria-label="当前任务详情">
          {selected ? (
            <>
              <button
                className="task-mobile-back"
                type="button"
                onClick={() => setMobileView("list")}
              >
                <ArrowLeft size={14} />
                返回任务列表
              </button>
              <header className="task-inspector-header">
                <div>
                  <span>{selected.id}</span>
                  <h2>{selected.title}</h2>
                </div>
                <strong className={`task-priority ${selected.priority}`}>
                  {priorityLabel[selected.priority]}
                </strong>
              </header>

              <section className="task-progress" aria-label="任务状态">
                <div className="task-progress-heading">
                  <h3>任务进度</h3>
                  <span>
                    {columns.findIndex(
                      (column) => column.key === selected.status,
                    ) + 1}
                    /4
                  </span>
                </div>
                <ol>
                  {columns.map((column, index) => {
                    const currentIndex = columns.findIndex(
                      (item) => item.key === selected.status,
                    );
                    return (
                      <li
                        key={column.key}
                        className={
                          index < currentIndex
                            ? "complete"
                            : index === currentIndex
                              ? "current"
                              : ""
                        }
                        aria-current={
                          column.key === selected.status ? "step" : undefined
                        }
                      >
                        <span>
                          {index < currentIndex ? (
                            <Check size={11} />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <small>{column.label}</small>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <dl className="task-assignment">
                <div>
                  <dt>负责人</dt>
                  <dd>
                    <UserRound size={13} />
                    {selected.owner}
                  </dd>
                </div>
                <div>
                  <dt>复核人</dt>
                  <dd>{selected.reviewer}</dd>
                </div>
                <div>
                  <dt>截止日期</dt>
                  <dd>
                    <CalendarClock size={13} />
                    {selected.dueDate}
                  </dd>
                </div>
              </dl>

              <section className="task-source-chain">
                <h3>来源</h3>
                <Link href={taskSourceHref(projectId, selected)}>
                  <FileText size={15} />
                  <span>
                    <strong>{selected.sourceLabel}</strong>
                    <small>{selected.evidence}</small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              </section>

              <section className="task-detail-section">
                <h3>整改原因</h3>
                <p>{selected.reason}</p>
              </section>

              <section className="task-detail-section">
                <h3>处理步骤</h3>
                <ol>
                  {selected.steps.map((step, index) => (
                    <li key={step}>
                      <span>{index + 1}</span>
                      <p>{step}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <dl className="task-record-counts" aria-label="任务现有记录">
                <div>
                  <dt>附件记录</dt>
                  <dd>{selected.attachments}</dd>
                </div>
                <div>
                  <dt>评论记录</dt>
                  <dd>{selected.comments}</dd>
                </div>
              </dl>

              <footer className="task-next-action">
                <div>
                  <small>下一步</small>
                  <strong>{nextActionLabel[selected.status]}</strong>
                </div>
                <button
                  className={`button ${selected.status === "done" ? "" : "primary"}`}
                  type="button"
                  onClick={() =>
                    void moveTask(selected.id, nextStatus[selected.status])
                  }
                >
                  {selected.status !== "done" && <Check size={14} />}
                  {nextActionLabel[selected.status]}
                </button>
              </footer>
            </>
          ) : (
            <div className="task-empty">
              <strong>暂无整改任务</strong>
              <p>创建任务后，可在这里查看来源并推进处理与复核。</p>
            </div>
          )}
        </aside>
      </div>

      {createOpen && (
        <div className="dialog-backdrop">
          <div
            className="dialog task-create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
          >
            <div className="dialog-title">
              <div>
                <h2 id="create-task-title">新建整改任务</h2>
                <p>新任务绑定当前项目，并从“待处理”开始流转。</p>
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
                onClick={() => void createTask()}
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

function TaskList({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: RemediationTask[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="task-list">
      <div className="task-list-header" aria-hidden="true">
        <span>整改任务</span>
        <span>状态</span>
        <span>负责人 → 复核人</span>
        <span>截止</span>
        <span>下一步</span>
      </div>
      <div role="list">
        {tasks.map((task) => (
          <div key={task.id} role="listitem">
            <button
              className={`task-list-row ${task.id === selectedId ? "selected" : ""}`}
              type="button"
              aria-pressed={task.id === selectedId}
              onClick={() => onSelect(task.id)}
            >
              <span className="task-list-title">
                <strong>{task.title}</strong>
                <small>{task.sourceLabel}</small>
              </span>
              <span className={`task-status status-${task.status}`}>
                {statusLabel(task.status)}
              </span>
              <span className="task-list-people">
                <strong>{task.owner}</strong>
                <small>→ {task.reviewer}</small>
              </span>
              <time>{task.dueDate.slice(5)}</time>
              <span className="task-list-next">
                {nextActionLabel[task.status]}
                <ChevronRight size={13} />
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskFlow({
  tasks,
  selectedId,
  dragId,
  onSelect,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  tasks: RemediationTask[];
  selectedId?: string;
  dragId: string | null;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (status: RemediationTask["status"]) => void;
}) {
  return (
    <div className="task-flow">
      {columns.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.key);
        return (
          <section
            key={column.key}
            aria-label={`${column.label}列`}
            className={dragId ? "drag-active" : ""}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop(column.key)}
          >
            <header>
              <strong>{column.label}</strong>
              <span>{columnTasks.length}</span>
            </header>
            <div>
              {columnTasks.map((task) => (
                <button
                  key={task.id}
                  className={task.id === selectedId ? "selected" : ""}
                  type="button"
                  draggable
                  onDragStart={() => onDragStart(task.id)}
                  onDragEnd={onDragEnd}
                  onClick={() => onSelect(task.id)}
                >
                  <span className={`task-priority ${task.priority}`}>
                    {priorityLabel[task.priority]}
                  </span>
                  <strong>{task.title}</strong>
                  <small>{task.sourceLabel}</small>
                  <footer>
                    <span>{task.owner}</span>
                    <time>{task.dueDate.slice(5)}</time>
                  </footer>
                </button>
              ))}
              {columnTasks.length === 0 && <p>暂无任务</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function statusLabel(status: RemediationTask["status"]) {
  return columns.find((column) => column.key === status)?.label ?? status;
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
      : task.sourceType === "agent_compliance_check" ||
          task.sourceType === "evidence"
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
