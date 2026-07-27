"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Warning as AlertTriangle,
  DownloadSimple as ArrowDownToLine,
  Robot as Bot,
  Check,
  CaretDown as ChevronDown,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  Copy as Clipboard,
  File as FileCheck2,
  FileText,
  Funnel as Filter,
  Checks as ListChecks,
  ChatText as MessageSquareText,
  FloppyDisk as Save,
  MagnifyingGlass as Search,
  ShieldCheck,
  UploadSimple as Upload,
  X,
} from "@phosphor-icons/react";
import {
  ConfidenceIndicator,
  RiskBadge,
  StatusBadge,
} from "@/components/ui/badges";
import { SourceCitation } from "@/components/ui/source-citation";
import { DocumentViewer } from "@/components/documents/document-viewer";
import {
  MutationFeedback,
  type MutationResult,
} from "@/components/feedback/mutation-feedback";
import { apiRequest } from "@/lib/api/client";
import type { DataSource } from "@/lib/phase-data/types";
import type { Requirement, RequirementStatus } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

type DetailTab = "detail" | "evidence" | "judgement" | "activity";
type WorkbenchView = "review" | "matrix" | "source";
type FilterKey =
  "all" | "disqualification" | "mandatory" | "missing" | "conflict" | "review";
const filterKeys = new Set<FilterKey>([
  "all",
  "disqualification",
  "mandatory",
  "missing",
  "conflict",
  "review",
]);
const workbenchViews = new Set<WorkbenchView>(["review", "matrix", "source"]);

const filterLabels: Record<FilterKey, string> = {
  all: "全部要求",
  disqualification: "否决项",
  mandatory: "强制条款",
  missing: "缺少证据",
  conflict: "存在冲突",
  review: "人工复核",
};
const requirementCategoryLabels: Record<string, string> = {
  qualification: "资格资质",
  commercial: "商务条件",
  technical: "技术要求",
  pricing: "报价要求",
  delivery: "交付计划",
  service: "服务保障",
  personnel: "人员要求",
  case: "案例业绩",
  legal: "法律与授权",
  security: "安全要求",
  format: "文件格式",
  signature: "签章要求",
  submission: "递交要求",
  other: "其他要求",
};
const feedbackResult = (
  source: DataSource,
  persisted: boolean,
  message: string,
  failed = false,
  title = failed ? "操作未完成" : "操作已完成",
): MutationResult => ({
  source,
  persisted,
  message,
  title,
  status: failed ? "error" : persisted ? "success" : "warning",
});

export function RequirementsWorkbench({
  initialRequirements,
  projectId = "demo-project",
  source = "demo",
}: {
  initialRequirements: Requirement[];
  projectId?: string;
  source?: DataSource;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState(initialRequirements);
  const [selectedId, setSelectedId] = useState(initialRequirements[0]?.id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<WorkbenchView>("review");
  const [tab, setTab] = useState<DetailTab>("detail");
  const [flash, setFlash] = useState(0);
  const [evidenceState, setEvidenceState] = useState<
    "pending" | "accepted" | "rejected"
  >("pending");
  const [evidenceRejectReason, setEvidenceRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideStatus, setOverrideStatus] =
    useState<RequirementStatus>("met");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchOwner, setBatchOwner] = useState("刘敏");
  const [agentOpen, setAgentOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const initialItemsRef = useRef(initialRequirements);

  const visibleItems = useMemo(
    () => filterRequirements(items, query, filter),
    [filter, items, query],
  );
  const selected =
    visibleItems.find((item) => item.id === selectedId) ??
    visibleItems[0] ??
    items[0];
  const selectedIndex = visibleItems.findIndex(
    (item) => item.id === selected?.id,
  );

  useEffect(() => {
    let cancelled = false;
    try {
      const stored = JSON.parse(
        localStorage.getItem("bidevidence.requirements.view") ?? "null",
      ) as { filter?: string; query?: string; view?: string } | null;
      if (!stored) return;
      const nextFilter = filterKeys.has(stored.filter as FilterKey)
        ? (stored.filter as FilterKey)
        : "all";
      const nextQuery = typeof stored.query === "string" ? stored.query : "";
      const nextView = workbenchViews.has(stored.view as WorkbenchView)
        ? (stored.view as WorkbenchView)
        : "review";
      const nextItems = filterRequirements(
        initialItemsRef.current,
        nextQuery,
        nextFilter,
      );
      queueMicrotask(() => {
        if (cancelled) return;
        setFilter(nextFilter);
        setQuery(nextQuery);
        setView(nextView);
        if (nextItems.length) setSelectedId(nextItems[0].id);
      });
    } catch {
      localStorage.removeItem("bidevidence.requirements.view");
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!selected) return null;

  function select(item: Requirement) {
    setSelectedId(item.id);
    setEvidenceState("pending");
    setFlash((value) => value + 1);
  }

  function moveSelection(direction: -1 | 1) {
    if (!visibleItems.length) return;
    const next = Math.min(
      visibleItems.length - 1,
      Math.max(0, selectedIndex + direction),
    );
    select(visibleItems[next]);
  }

  function rowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    item: Requirement,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(item);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
    }
  }

  function exportCsv() {
    const rows = [
      ["编号", "标题", "分类", "状态", "页码", "置信度"],
      ...visibleItems.map((item) => [
        item.code,
        item.title,
        item.category,
        item.status,
        String(item.page),
        String(item.confidence),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "合规矩阵.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(selected.originalText);
      setFeedback(feedbackResult("demo", false, "原文已复制到剪贴板。"));
    } catch {
      setFeedback(
        feedbackResult(
          "demo",
          false,
          "浏览器未授予剪贴板权限，请手动复制原文。",
          true,
        ),
      );
    }
  }

  function saveView() {
    localStorage.setItem(
      "bidevidence.requirements.view",
      JSON.stringify({ filter, query, view }),
    );
    setFeedback(
      feedbackResult("demo", false, "当前筛选视图仅保存在本机浏览器。"),
    );
  }

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    const nextItems = filterRequirements(items, nextQuery, filter);
    if (nextItems.length && !nextItems.some((item) => item.id === selectedId))
      select(nextItems[0]);
  }

  function updateFilter(nextFilter: FilterKey) {
    setFilter(nextFilter);
    const nextItems = filterRequirements(items, query, nextFilter);
    if (nextItems.length && !nextItems.some((item) => item.id === selectedId))
      select(nextItems[0]);
  }

  async function submitOverride() {
    if (!overrideReason.trim()) return;
    if (source === "api") {
      try {
        if (["met", "failed"].includes(overrideStatus))
          await apiRequest(`/api/requirements/${selected.id}/verify`, {
            method: "POST",
            body: JSON.stringify({
              decision: overrideStatus === "met" ? "verify" : "reject",
              reason: overrideReason,
            }),
          });
        else
          await apiRequest(`/api/requirements/${selected.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              normalized_requirement: selected.normalizedText,
              reason: overrideReason,
            }),
          });
      } catch (error) {
        setFeedback(
          feedbackResult(
            "api",
            false,
            `覆盖失败，当前状态未更改：${error instanceof Error ? error.message : "未知错误"}`,
            true,
          ),
        );
        return;
      }
    }
    setItems((current) =>
      current.map((item) =>
        item.id === selected.id ? { ...item, status: overrideStatus } : item,
      ),
    );
    setOverrideOpen(false);
    setOverrideReason("");
    setFeedback(
      feedbackResult(
        source,
        source === "api",
        source === "api"
          ? "人工覆盖已写入 API 并进入审计。"
          : "人工覆盖只更新当前演示视图；未写入正式审计。",
      ),
    );
  }

  function toggleRow(id: string) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function applyBatch() {
    if (!selectedRows.size) {
      setFeedback(
        feedbackResult("demo", false, "请先勾选至少一条要求。", true),
      );
      return;
    }
    setItems((current) =>
      current.map((item) =>
        selectedRows.has(item.id)
          ? {
              ...item,
              owner: batchOwner,
              status: item.status === "review" ? "review" : item.status,
            }
          : item,
      ),
    );
    setBatchOpen(false);
    setFeedback(
      feedbackResult(
        "demo",
        false,
        `已在当前视图为 ${selectedRows.size} 条要求分配负责人 ${batchOwner}。`,
      ),
    );
  }

  async function applyAgentStructure() {
    const targets = items.filter(
      (item) =>
        selectedRows.has(item.id) ||
        (!selectedRows.size && item.id === selected.id),
    );
    if (source === "api") {
      try {
        for (const item of targets)
          await apiRequest(`/api/requirements/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              normalized_requirement: item.normalizedText.trim(),
              reason: "人工复核并应用 Agent 结构化建议",
            }),
          });
      } catch (error) {
        setFeedback(
          feedbackResult(
            "api",
            false,
            `结构化建议写入失败，未更新本地状态：${error instanceof Error ? error.message : "未知错误"}`,
            true,
          ),
        );
        return;
      }
    }
    setItems((current) =>
      current.map((item) =>
        selectedRows.has(item.id) ||
        (!selectedRows.size && item.id === selected.id)
          ? {
              ...item,
              normalizedText: item.normalizedText.trim(),
              expectedEvidence: item.expectedEvidence.trim(),
            }
          : item,
      ),
    );
    setAgentOpen(false);
    setFeedback(
      feedbackResult(
        source,
        source === "api",
        `已人工应用 ${selectedRows.size || 1} 条结构化建议；Agent 输出未自动覆盖原始条款。`,
      ),
    );
  }

  async function acceptEvidence(next: "accepted" | "rejected") {
    const reason =
      next === "accepted"
        ? `人工核验推荐证据：${selected.evidence ?? "无证据"}`
        : evidenceRejectReason;
    if (source === "api") {
      try {
        await apiRequest(`/api/requirements/${selected.id}/verify`, {
          method: "POST",
          body: JSON.stringify({
            decision: next === "accepted" ? "verify" : "reject",
            reason,
          }),
        });
      } catch (error) {
        setFeedback(
          feedbackResult(
            "api",
            false,
            `证据决策失败，当前状态未更改：${error instanceof Error ? error.message : "未知错误"}`,
            true,
          ),
        );
        return;
      }
    }
    setEvidenceState(next);
    setRejectOpen(false);
    setFeedback(
      feedbackResult(
        source,
        source === "api",
        next === "accepted"
          ? "证据接受决定已记录。"
          : `已记录拒绝原因：${evidenceRejectReason}`,
      ),
    );
  }

  return (
    <div
      className={`page-workbench requirements-page requirements-view-${view}`}
      data-project-id={projectId}
    >
      <header className="workbench-heading v4-review-heading">
        <div>
          <span className="workbench-kicker"><ShieldCheck size={13} />合规工作区</span>
          <h1>合规审阅</h1>
          <p>逐条核对招标要求、原文与企业证据</p>
        </div>
        <div className="v4-review-stats" aria-label="合规审阅统计">
          <span><small>全部要求</small><strong>{items.length}</strong></span>
          <span><small>否决候选</small><strong className="danger">{items.filter((item) => item.disqualification).length}</strong></span>
          <span><small>待人工确认</small><strong className="warning">{items.filter((item) => item.status === "review" || item.confidence < 0.7).length}</strong></span>
          <span><small>来源文档</small><strong>{new Set(items.map((item) => item.sourceDocument)).size}</strong></span>
        </div>
        <div className="header-actions">
          <div
            className="requirements-view-switcher"
            role="group"
            aria-label="合规工作台视图"
          >
            {(
              [
                ["review", "三栏审阅"],
                ["matrix", "矩阵聚焦"],
                ["source", "来源聚焦"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className={`data-source ${source}`}>
            {source === "api" ? "API 数据" : "本地演示数据"}
          </span>
          <button className="button" type="button" onClick={saveView}>
            <Save size={14} />
            保存视图
          </button>
          <button className="button" type="button" onClick={exportCsv}>
            <ArrowDownToLine size={14} />
            导出矩阵
          </button>
          <button
            className="button primary"
            type="button"
            onClick={() => setCompleteOpen(true)}
          >
            <Check size={14} />
            完成本轮复核
          </button>
        </div>
      </header>

      <section className="workbench-alert v4-review-alert" role="status">
        <AlertTriangle size={15} />
        <span>
          <strong>
            {t("{count} 项高优先级待处理", {
              count: items.filter(
                (item) =>
                  ["fatal", "high"].includes(item.risk) &&
                  item.status !== "met",
              ).length,
            })}
          </strong>{" "}
          · 来自当前矩阵的高风险且未满足/待复核要求。
        </span>
        <button
          type="button"
          onClick={() => updateFilter("disqualification")}
        >
          仅看否决项
          <ChevronRight size={13} />
        </button>
      </section>
      <MutationFeedback result={feedback} />

      <div className="requirements-grid">
        <section
          className="workbench-pane document-pane"
          aria-label="原始文档查看器"
        >
          <div className="pane-title">
            <div>
              <FileText size={15} />
              <span>
                <strong>{selected.sourceDocument}</strong>
                <small>{t("{version} · 86 页 · 已解析", { version: selected.sourceVersion })}</small>
              </span>
            </div>
            <span className="source-location-state">
              {t("第 {page} 页 · {clause}", { page: selected.page, clause: selected.clause })}
            </span>
          </div>
          <div key={flash} className="source-highlight">
            <DocumentViewer
              name={selected.sourceDocument}
              state="ready"
              initialPage={selected.page}
              pageCount={86}
              excerpt={selected.originalText}
              focusLabel={selected.title}
              sourceLocation={`${selected.sourceVersion} · ${selected.clause}`}
              demo
            />
          </div>
          <div className="document-footer">
            <button
              type="button"
              disabled={!visibleItems.length || selectedIndex === 0}
              onClick={() => moveSelection(-1)}
            >
              <ChevronLeft size={13} />
              上一条
            </button>
            <span>
              <strong>{t("第 {page} 页", { page: selected.page })}</strong> / {t("86 页")}
            </span>
            <button
              type="button"
              disabled={selectedIndex === visibleItems.length - 1}
              onClick={() => moveSelection(1)}
            >
              下一条
              <ChevronRight size={13} />
            </button>
          </div>
        </section>

        <section className="workbench-pane matrix-pane" aria-label="合规矩阵">
          <div className="pane-title">
            <div>
              <FileCheck2 size={15} />
              <span>
                <strong>合规矩阵</strong>
                <small>
                  {t("{visible} / {total} 条要求 · 已选 {selected}", {
                    visible: visibleItems.length,
                    total: items.length,
                    selected: selectedRows.size,
                  })}
                </small>
              </span>
            </div>
            <span>
              <button
                className="mini-action"
                type="button"
                onClick={() => setAgentOpen(true)}
              >
                <Clipboard size={13} />
                应用结构
              </button>
              <button
                className="mini-action"
                type="button"
                onClick={() => setBatchOpen(true)}
              >
                <ListChecks size={13} />
                批量操作
              </button>
            </span>
          </div>
          <div className="matrix-filters">
            <label>
              <Search size={13} />
              <input
                aria-label="搜索要求"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="搜索编号、标题、原文"
              />
            </label>
            <div className="filter-menu">
              <Filter size={13} />
              <select
                aria-label="筛选要求"
                value={filter}
                onChange={(event) =>
                  updateFilter(event.target.value as FilterKey)
                }
              >
                {Object.entries(filterLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </div>
          </div>
          <div className="active-filters">
            {filter !== "all" && (
              <button type="button" onClick={() => updateFilter("all")}>
                {filterLabels[filter]} <X size={11} />
              </button>
            )}
            <span>
              {t("{count} 条低置信度已路由人工", {
                count: visibleItems.filter((item) => item.confidence < 0.7).length,
              })}
            </span>
          </div>
          {selectedRows.size > 0 && (
            <div className="matrix-selection-bar" role="status">
              <span>
                <Check size={13} weight="bold" />
                已选择 {selectedRows.size} 条要求
              </span>
              <button type="button" onClick={() => setBatchOpen(true)}>
                分配负责人
              </button>
              <button type="button" onClick={() => setSelectedRows(new Set())}>
                清除选择
              </button>
            </div>
          )}
          <div className="matrix-table-wrap" ref={tableRef}>
            <table className="matrix-table">
              <thead>
                <tr>
                  <th>
                    <input
                      aria-label="选择全部可见要求"
                      type="checkbox"
                      checked={
                        visibleItems.length > 0 &&
                        visibleItems.every((item) => selectedRows.has(item.id))
                      }
                      onChange={(event) =>
                        setSelectedRows((current) => {
                          const next = new Set(current);
                          visibleItems.forEach((item) =>
                            event.target.checked
                              ? next.add(item.id)
                              : next.delete(item.id),
                          );
                          return next;
                        })
                      }
                    />
                  </th>
                  <th>编号 / 要求</th>
                  <th>风险</th>
                  <th>状态</th>
                  <th>证据 / 置信度</th>
                  <th>负责人</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === selected.id ? "selected" : ""}
                    tabIndex={0}
                    aria-selected={item.id === selected.id}
                    onClick={() => select(item)}
                    onKeyDown={(event) => rowKeyDown(event, item)}
                  >
                    <td onClick={(event) => event.stopPropagation()}>
                      <input
                        aria-label={`选择 ${item.code}`}
                        type="checkbox"
                        checked={selectedRows.has(item.id)}
                        onChange={() => toggleRow(item.id)}
                      />
                    </td>
                    <td>
                      <span>
                        {item.code} ·{" "}
                        {t(requirementCategoryLabels[item.category] ??
                          item.category)}
                      </span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.mandatory ? t("强制") : t("一般")}
                        {item.disqualification ? ` · ${t("否决风险")}` : ""} ·{" "}
                        {t("第 {page} 页", { page: item.page })}
                      </small>
                    </td>
                    <td>
                      <RiskBadge level={item.risk} />
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      <span className="evidence-name">
                        {item.evidence ?? "暂无证据"}
                      </span>
                      <ConfidenceIndicator value={item.confidence} />
                    </td>
                    <td>
                      <span
                        className={
                          item.owner === "未分配" ? "unassigned" : "owner-chip"
                        }
                      >
                        {item.owner}
                      </span>
                      <small>{item.dueDate}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleItems.length === 0 && (
              <div className="empty-state">
                <strong>没有匹配的要求</strong>清除筛选条件以查看全部 20 条。
              </div>
            )}
          </div>
          <div className="matrix-footer">
            <span>↑↓ 选择 · Enter 打开</span>
            <span>{t("已加载全部 {count} 条", { count: visibleItems.length })}</span>
          </div>
        </section>

        <section className="workbench-pane detail-pane" aria-label="要求详情">
          <div className="detail-summary">
            <div>
              <span>
                {selected.code} ·{" "}
                {t(requirementCategoryLabels[selected.category] ??
                  selected.category)}
              </span>
              <h2>{selected.title}</h2>
            </div>
            <RiskBadge level={selected.risk} />
          </div>
          <SourceCitation
            document={selected.sourceDocument}
            page={selected.page}
            clause={selected.clause}
            version={selected.sourceVersion}
            onNavigate={() => setFlash((value) => value + 1)}
          />
          <div className="detail-tabs" role="tablist">
            {(
              [
                ["detail", "要求详情"],
                ["evidence", "证据"],
                ["judgement", "判断"],
                ["activity", "活动"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {label}
                {key === "activity" && <span>3</span>}
              </button>
            ))}
          </div>
          <div className="detail-scroll">
            {tab === "detail" && (
              <DetailTabContent selected={selected} onCopy={copyText} />
            )}
            {tab === "evidence" && (
              <EvidenceTab
                selected={selected}
                state={evidenceState}
                rejectionReason={evidenceRejectReason}
                onReject={() => setRejectOpen(true)}
                onAccept={() => acceptEvidence("accepted")}
                onReset={() => setEvidenceState("pending")}
                onPicker={() => setPickerOpen(true)}
              />
            )}
            {tab === "judgement" && (
              <JudgementTab
                selected={selected}
                onOverride={() => setOverrideOpen(true)}
              />
            )}
            {tab === "activity" && <ActivityTab selected={selected} />}
          </div>
        </section>
      </div>

      {overrideOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setOverrideOpen(false)
          }
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="override-title"
          >
            <div className="dialog-title">
              <div>
                <h2 id="override-title">人工覆盖系统判断</h2>
                <p>
                  当前为本地演示状态；连接后端后由覆盖 API 保留原结果和原因。
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setOverrideOpen(false)}
              >
                <X size={15} />
              </button>
            </div>
            <label className="form-field">
              <span>覆盖后状态</span>
              <select
                value={overrideStatus}
                onChange={(event) =>
                  setOverrideStatus(event.target.value as RequirementStatus)
                }
              >
                <option value="met">已满足</option>
                <option value="failed">不满足</option>
                <option value="review">继续人工复核</option>
                <option value="missing">缺少证据</option>
              </select>
            </label>
            <label className="form-field">
              <span>
                覆盖原因 <em>必填</em>
              </span>
              <textarea
                autoFocus
                rows={4}
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="说明核验的原件、规则例外或其他依据，不少于一句完整说明。"
              />
            </label>
            <div className="dialog-warning">
              <AlertTriangle size={14} />
              人工覆盖不等同于法律资格结论，仍须由授权审批人复核。
            </div>
            <div className="dialog-actions">
              <button
                className="button"
                type="button"
                onClick={() => setOverrideOpen(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="button"
                disabled={!overrideReason.trim()}
                onClick={submitOverride}
              >
                保存本地演示状态
              </button>
            </div>
          </div>
        </div>
      )}
      {batchOpen && (
        <SimpleDialog
          title="批量分配负责人"
          onClose={() => setBatchOpen(false)}
        >
          <p>
            将更新当前勾选的 {selectedRows.size} 条要求；不会自动改变合规结论。
          </p>
          <label className="form-field">
            <span>负责人</span>
            <select
              value={batchOwner}
              onChange={(event) => setBatchOwner(event.target.value)}
            >
              <option>刘敏</option>
              <option>王琳</option>
              <option>赵一舟</option>
              <option>未分配</option>
            </select>
          </label>
          <div className="dialog-actions">
            <button
              className="button"
              type="button"
              onClick={() => setBatchOpen(false)}
            >
              取消
            </button>
            <button
              className="button primary"
              type="button"
              disabled={!selectedRows.size}
              onClick={applyBatch}
            >
              应用到 {selectedRows.size} 条
            </button>
          </div>
        </SimpleDialog>
      )}
      {agentOpen && (
        <SimpleDialog
          title="结构化建议"
          onClose={() => setAgentOpen(false)}
        >
          <div className="dialog-warning">
            <Bot size={14} />
            MockLLMProvider 仅给出候选结构；应用前必须人工确认，低于 70%
            继续路由复核。
          </div>
          <dl className="detail-grid">
            <div>
              <dt>处理范围</dt>
              <dd>
                {selectedRows.size
                  ? `${selectedRows.size} 条已选要求`
                  : selected.code}
              </dd>
            </div>
            <div>
              <dt>输出字段</dt>
              <dd>类别、强制性、预期证据、规则线索</dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>requirement.extract.v2</dd>
            </div>
            <div>
              <dt>写入方式</dt>
              <dd>人工应用，不覆盖原文</dd>
            </div>
          </dl>
          <div className="dialog-actions">
            <button
              className="button"
              type="button"
              onClick={() => setAgentOpen(false)}
            >
              保留待复核
            </button>
            <button
              className="button primary"
              type="button"
              onClick={applyAgentStructure}
            >
              人工应用建议
            </button>
          </div>
        </SimpleDialog>
      )}
      {completeOpen && (
        <SimpleDialog
          title="完成本轮复核"
          onClose={() => setCompleteOpen(false)}
        >
          <p>
            当前可见 {visibleItems.length} 条，其中{" "}
            {visibleItems.filter((item) => item.status === "review").length}{" "}
            条仍需人工复核。此操作仅记录演示进度，不代表法律结论。
          </p>
          <div className="dialog-actions">
            <button
              className="button"
              type="button"
              onClick={() => setCompleteOpen(false)}
            >
              继续检查
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setCompleteOpen(false);
                setFeedback(
                  feedbackResult(
                    "demo",
                    false,
                    "本轮复核进度已更新；尚未写入后端审计。",
                  ),
                );
              }}
            >
              确认完成演示复核
            </button>
          </div>
        </SimpleDialog>
      )}
      {rejectOpen && (
        <SimpleDialog title="拒绝推荐证据" onClose={() => setRejectOpen(false)}>
          <label className="form-field">
            <span>
              拒绝原因 <em>必填</em>
            </span>
            <textarea
              rows={3}
              value={evidenceRejectReason}
              onChange={(event) => setEvidenceRejectReason(event.target.value)}
              placeholder="如：主体不一致、证书已过期、页面不可辨认。"
            />
          </label>
          <div className="dialog-actions">
            <button
              className="button"
              type="button"
              onClick={() => setRejectOpen(false)}
            >
              取消
            </button>
            <button
              className="button danger"
              type="button"
              disabled={!evidenceRejectReason.trim()}
              onClick={() => acceptEvidence("rejected")}
            >
              记录原因并拒绝
            </button>
          </div>
        </SimpleDialog>
      )}
      {pickerOpen && (
        <SimpleDialog title="更换证据" onClose={() => setPickerOpen(false)}>
          <p>
            材料选择器当前展示项目可用证据。正式关联须在证据匹配工作台人工接受。
          </p>
          <button
            className="button full-width"
            type="button"
            onClick={() => {
              setPickerOpen(false);
              setFeedback(
                feedbackResult(
                  "demo",
                  false,
                  "已选择演示候选；尚未建立正式证据关联。",
                ),
              );
            }}
          >
            ISO 27001 信息安全管理体系认证证书.pdf
          </button>
        </SimpleDialog>
      )}
    </div>
  );
}

function DetailTabContent({
  selected,
  onCopy,
}: {
  selected: Requirement;
  onCopy: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="detail-sections">
      <section>
        <h3>标准化要求</h3>
        <p className="normalized-text">{selected.normalizedText}</p>
      </section>
      <section>
        <div className="section-heading">
          <h3>招标原文</h3>
          <button type="button" onClick={onCopy}>
            <Clipboard size={12} />
            复制
          </button>
        </div>
        <blockquote>{selected.originalText}</blockquote>
      </section>
      <dl className="detail-grid">
        <div>
          <dt>条款号</dt>
          <dd>{selected.clause}</dd>
        </div>
        <div>
          <dt>来源页</dt>
          <dd>{t("第 {page} 页", { page: selected.page })}</dd>
        </div>
        <div>
          <dt>强制性</dt>
          <dd>{selected.mandatory ? "是 · 强制" : "否 · 一般"}</dd>
        </div>
        <div>
          <dt>否决风险</dt>
          <dd>{selected.disqualification ? "是 · 需重点确认" : "否"}</dd>
        </div>
      </dl>
      <section>
        <h3>期望证明材料</h3>
        <p>{selected.expectedEvidence}</p>
      </section>
      <section>
        <h3>提取置信度</h3>
        <ConfidenceIndicator value={selected.confidence} />
        {selected.confidence < 0.7 && (
          <p className="review-routing">
            <AlertTriangle size={13} />
            低于 70%，系统未自动确认，已进入人工复核队列。
          </p>
        )}
      </section>
    </div>
  );
}
function EvidenceTab({
  selected,
  state,
  rejectionReason,
  onReject,
  onAccept,
  onReset,
  onPicker,
}: {
  selected: Requirement;
  state: "pending" | "accepted" | "rejected";
  rejectionReason: string;
  onReject: () => void;
  onAccept: () => void;
  onReset: () => void;
  onPicker: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="detail-sections">
      <section>
        <div className="section-heading">
          <h3>推荐证据</h3>
          <span className="match-score">匹配 92%</span>
        </div>
        {selected.evidence ? (
          <article className="evidence-card">
            <div className="evidence-card-head">
              <span>
                <FileText size={16} />
              </span>
              <div>
                <strong>{selected.evidence}</strong>
                <small>上海智园数字科技有限公司 · 当前版本</small>
              </div>
            </div>
            <dl>
              <div>
                <dt>有效期</dt>
                <dd>
                  {selected.status === "missing"
                    ? "已过期 / 待补充"
                    : "2027-12-31"}
                </dd>
              </div>
              <div>
                <dt>来源页</dt>
                <dd>{t("第 1–2 页")}</dd>
              </div>
              <div>
                <dt>匹配理由</dt>
                <dd>材料类型、主体与要求关键词一致</dd>
              </div>
            </dl>
            <blockquote>
              “兹证明上海智园数字科技有限公司所提供材料真实有效……”
            </blockquote>
          </article>
        ) : (
          <div className="no-evidence">
            <Upload size={21} />
            <strong>暂未找到可接受证据</strong>
            <p>上传新证据或扩大材料库检索范围。</p>
          </div>
        )}
      </section>
      {state === "pending" ? (
        <div className="evidence-actions">
          <button className="button danger" type="button" onClick={onReject}>
            <X size={13} />
            拒绝推荐
          </button>
          <button
            className="button primary"
            type="button"
            disabled={!selected.evidence}
            onClick={onAccept}
          >
            <Check size={13} />
            接受证据
          </button>
        </div>
      ) : (
        <div className={`evidence-decision ${state}`}>
          <strong>{state === "accepted" ? "证据已接受" : "推荐已拒绝"}</strong>
          <p>
            {state === "accepted"
              ? "该证据将参与后续确定性规则判断。"
              : `拒绝原因：${rejectionReason}`}
          </p>
          <button type="button" onClick={onReset}>
            撤销本次操作
          </button>
        </div>
      )}
      <button className="button full-width" type="button" onClick={onPicker}>
        <FileCheck2 size={14} />
        更换证据
      </button>
    </div>
  );
}
function JudgementTab({
  selected,
  onOverride,
}: {
  selected: Requirement;
  onOverride: () => void;
}) {
  return (
    <div className="detail-sections">
      <section className="rule-result">
        <div className="section-heading">
          <h3>系统结果</h3>
          <StatusBadge status={selected.status} />
        </div>
        <dl>
          <div>
            <dt>预期条件</dt>
            <dd>{selected.normalizedText}</dd>
          </div>
          <div>
            <dt>实际值</dt>
            <dd>{selected.actualValue}</dd>
          </div>
          <div>
            <dt>使用规则</dt>
            <dd>{selected.rule}</dd>
          </div>
          <div>
            <dt>判断理由</dt>
            <dd>{selected.reasoning}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3>判断置信度</h3>
        <ConfidenceIndicator value={selected.confidence} />
        <p className="rule-note">
          置信度仅表示提取与匹配稳定性，不代表法律准确性。
        </p>
      </section>
      <button className="button full-width" type="button" onClick={onOverride}>
        <MessageSquareText size={14} />
        人工覆盖判断
      </button>
    </div>
  );
}
function ActivityTab({ selected }: { selected: Requirement }) {
  return (
    <ol className="detail-activity">
      <li>
        <span>14:26</span>
        <div>
          <strong>刘敏打开要求进行复核</strong>
          <p>查看了来源页和推荐证据。</p>
        </div>
      </li>
      <li>
        <span>14:18</span>
        <div>
          <strong>规则引擎更新判断</strong>
          <p>{selected.rule} · 运行结果已追加。</p>
        </div>
      </li>
      <li>
        <span>14:12</span>
        <div>
          <strong>要求提取完成</strong>
          <p>
            MockLLMProvider · Prompt v1.2 · 置信度{" "}
            {Math.round(selected.confidence * 100)}%
          </p>
        </div>
      </li>
    </ol>
  );
}

function filterRequirements(
  items: Requirement[],
  query: string,
  filter: FilterKey,
) {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    const textMatch = `${item.code}${item.title}${item.category}${item.originalText}`
      .toLowerCase()
      .includes(normalizedQuery);
    const filterMatch =
      filter === "all" ||
      (filter === "disqualification" && item.disqualification) ||
      (filter === "mandatory" && item.mandatory) ||
      (filter === "missing" && item.status === "missing") ||
      (filter === "conflict" && item.status === "conflict") ||
      (filter === "review" && item.status === "review");
    return textMatch && filterMatch;
  });
}

function SimpleDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
