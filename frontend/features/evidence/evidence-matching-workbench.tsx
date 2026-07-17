"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronRight,
  FileText,
  GripVertical,
  Link2,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { RiskBadge, StatusBadge } from "@/components/ui/badges";
import {
  DocumentDialog,
  DocumentViewer,
} from "@/components/documents/document-viewer";
import {
  MutationFeedback,
  type MutationResult,
} from "@/components/feedback/mutation-feedback";
import { phaseApi } from "@/lib/api/phase2";
import type {
  DataSource,
  EvidenceCandidate,
  EvidenceMatchGroup,
} from "@/lib/phase-data/types";

const actionFeedback = (
  result: { message: string; persisted: boolean; failed?: boolean },
  source: DataSource,
): MutationResult => ({
  source,
  persisted: result.persisted,
  status: result.failed ? "error" : result.persisted ? "success" : "warning",
  title: result.failed ? "证据决策失败" : "证据决策已完成",
  message: result.message,
});
const localFeedback = (message: string, failed = false): MutationResult => ({
  source: "demo",
  persisted: false,
  status: failed ? "error" : "warning",
  title: failed ? "操作未完成" : "本地候选已更新",
  message,
});

export function EvidenceMatchingWorkbench({
  projectId,
  initialGroups,
  source,
  error,
}: {
  projectId: string;
  initialGroups: EvidenceMatchGroup[];
  source: DataSource;
  error?: string;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [selectedId, setSelectedId] = useState(initialGroups[0]?.id);
  const [query, setQuery] = useState("");
  const [onlyUnresolved, setOnlyUnresolved] = useState(false);
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const [dragCandidate, setDragCandidate] = useState<EvidenceCandidate | null>(
    null,
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rejectCandidate, setRejectCandidate] =
    useState<EvidenceCandidate | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [sourceCandidate, setSourceCandidate] =
    useState<EvidenceCandidate | null>(null);
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0];
  const filtered = useMemo(
    () =>
      groups.filter(
        (group) =>
          `${group.requirementCode}${group.requirementTitle}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (!onlyUnresolved ||
            group.candidates.some((item) => item.decision === "pending")),
      ),
    [groups, onlyUnresolved, query],
  );

  async function decide(
    candidate: EvidenceCandidate,
    decision: "accept" | "reject",
    reason = "",
  ) {
    const decisionReason = decision === "reject" ? reason : "人工接受证据匹配";
    if (decision === "reject" && !decisionReason.trim()) return;
    const result = await phaseApi.decideMatch(
      candidate.id,
      decision,
      decisionReason,
    );
    if (result.failed) {
      setFeedback(actionFeedback(result, source));
      return;
    }
    setGroups((current) =>
      current.map((group) =>
        group.id === selected.id
          ? {
              ...group,
              selectedEvidenceIds:
                decision === "accept"
                  ? Array.from(
                      new Set([
                        ...group.selectedEvidenceIds,
                        candidate.evidenceId,
                      ]),
                    )
                  : group.selectedEvidenceIds.filter(
                      (id) => id !== candidate.evidenceId,
                    ),
              candidates: group.candidates.map((item) =>
                item.id === candidate.id
                  ? {
                      ...item,
                      decision: decision === "accept" ? "accepted" : "rejected",
                    }
                  : item,
              ),
            }
          : group,
      ),
    );
    setFeedback(actionFeedback(result, source));
    setRejectCandidate(null);
    setRejectReason("");
  }

  function dropOnGroup(targetId: string) {
    if (!dragCandidate) return;
    setGroups((current) =>
      current.map((group) =>
        group.id === targetId &&
        !group.candidates.some(
          (item) => item.evidenceId === dragCandidate.evidenceId,
        )
          ? {
              ...group,
              candidates: [
                ...group.candidates,
                {
                  ...dragCandidate,
                  id: `local-link-${targetId}-${dragCandidate.evidenceId}`,
                  decision: "pending",
                  score: Math.max(0.55, dragCandidate.score - 0.12),
                  reason: [
                    ...dragCandidate.reason,
                    "由人工拖拽建立跨要求候选关联",
                  ],
                },
              ],
            }
          : group,
      ),
    );
    setSelectedId(targetId);
    setFeedback(
      localFeedback("已建立待确认的多对多候选关联；尚未接受为正式证据。"),
    );
    setDragCandidate(null);
  }

  async function bulkConfirm() {
    const eligible = groups.flatMap((group) =>
      group.candidates.filter(
        (item) =>
          item.decision === "pending" &&
          item.score >= 0.9 &&
          !item.reason.some((reason) => reason.includes("过期")),
      ),
    );
    if (!eligible.length) {
      setFeedback({
        ...localFeedback("没有同时满足高分、有效且待确认条件的匹配。", true),
        source,
      });
      setBulkOpen(false);
      return;
    }
    for (const candidate of eligible) {
      const result = await phaseApi.decideMatch(
        candidate.id,
        "accept",
        "批量人工确认高置信度匹配",
      );
      if (result.failed) {
        setFeedback(actionFeedback(result, source));
        return;
      }
    }
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        selectedEvidenceIds: Array.from(
          new Set([
            ...group.selectedEvidenceIds,
            ...group.candidates
              .filter((item) =>
                eligible.some((eligibleItem) => eligibleItem.id === item.id),
              )
              .map((item) => item.evidenceId),
          ]),
        ),
        candidates: group.candidates.map((item) =>
          eligible.some((eligibleItem) => eligibleItem.id === item.id)
            ? { ...item, decision: "accepted" as const }
            : item,
        ),
      })),
    );
    setFeedback({
      source,
      persisted: source === "api",
      status: source === "api" ? "success" : "warning",
      title: "批量确认已完成",
      message:
        source === "api"
          ? "高置信度匹配已提交后端。"
          : "已批量接受符合条件的匹配；未写入后端。",
    });
    setBulkOpen(false);
  }

  if (error && source === "api") {
    return (
      <div className="page match-page" data-project-id={projectId}>
        <header className="page-header">
          <div className="page-title-group">
            <h1>证据匹配工作台</h1>
            <p>一项要求可关联多份证据，一份材料也可复用于多个要求；所有匹配必须人工确认。</p>
          </div>
          <span className="data-source api">API 数据不可用</span>
        </header>
        <section className="panel empty-state" role="alert" aria-live="assertive">
          <AlertTriangle size={20} aria-hidden="true" />
          <strong>证据匹配数据暂时不可用</strong>
          <p>未能从 API 读取该项目的证据匹配。请检查本地服务后重试；当前页面不会显示替代数据。</p>
          <button className="button" type="button" onClick={() => window.location.reload()}>
            重试读取
          </button>
        </section>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="page match-page" data-project-id={projectId}>
        <header className="page-header">
          <div className="page-title-group">
            <h1>证据匹配工作台</h1>
            <p>一项要求可关联多份证据，一份材料也可复用于多个要求；所有匹配必须人工确认。</p>
          </div>
          <span className={`data-source ${source}`}>
            {source === "api" ? "API 数据" : "本地演示数据"}
          </span>
        </header>
        <section className="panel empty-state">
          <Link2 size={20} aria-hidden="true" />
          <strong>暂无待匹配要求</strong>
          <p>解析并人工确认招标要求后，证据候选会显示在这里。</p>
        </section>
      </div>
    );
  }
  const acceptedCount = groups.reduce(
    (sum, group) =>
      sum +
      group.candidates.filter((item) => item.decision === "accepted").length,
    0,
  );
  const eligibleCount = groups
    .flatMap((group) => group.candidates)
    .filter(
      (item) =>
        item.decision === "pending" &&
        item.score >= 0.9 &&
        !item.reason.some((reason) => reason.includes("过期")),
    ).length;
  return (
    <div className="page match-page" data-project-id={projectId}>
      <header className="page-header">
        <div className="page-title-group">
          <h1>证据匹配工作台</h1>
          <p>
            一项要求可关联多份证据，一份材料也可复用于多个要求；所有匹配必须人工确认。
          </p>
        </div>
        <div className="header-actions">
          <span className={`data-source ${source}`}>
            {source === "api" ? "API 数据" : "本地演示数据"}
          </span>
          <button
            className="button primary"
            type="button"
            onClick={() => setBulkOpen(true)}
          >
            <CheckCheck size={14} />
            批量确认高置信度
          </button>
        </div>
      </header>
      <section className="match-stats">
        <article>
          <span>
            <Link2 size={15} />
          </span>
          <strong>{groups.length}</strong>
          <small>待匹配要求</small>
        </article>
        <article>
          <span>
            <Check size={15} />
          </span>
          <strong>{acceptedCount}</strong>
          <small>已接受关联</small>
        </article>
        <article>
          <span>
            <AlertTriangle size={15} />
          </span>
          <strong>
            {groups.reduce(
              (sum, group) =>
                sum +
                group.candidates.filter((item) => item.decision === "pending")
                  .length,
              0,
            )}
          </strong>
          <small>待人工确认</small>
        </article>
        <p>
          <ShieldCheck size={14} />
          <span>
            <strong>不会自动接受全部高分匹配</strong>
            <small>
              批量操作排除过期与证据链不完整项，并要求人工二次确认。
            </small>
          </span>
        </p>
      </section>
      <MutationFeedback result={feedback} />
      <div className="matching-layout">
        <section className="panel match-requirements">
          <div className="panel-header">
            <div>
              <h2>招标要求</h2>
              <p>可将右侧证据拖到其他要求建立候选关联</p>
            </div>
            <span>{filtered.length} 条</span>
          </div>
          <div className="match-filters">
            <label>
              <Search size={13} />
              <input
                aria-label="搜索待匹配要求"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索要求编号或标题"
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={onlyUnresolved}
                onChange={(event) => setOnlyUnresolved(event.target.checked)}
              />
              仅看未确认
            </label>
          </div>
          <div className="match-group-list">
            {filtered.map((group) => (
              <button
                key={group.id}
                type="button"
                className={group.id === selected.id ? "selected" : ""}
                onClick={() => setSelectedId(group.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropOnGroup(group.id)}
              >
                <div>
                  <span>
                    {group.requirementCode} · 第 {group.page} 页
                  </span>
                  <strong>{group.requirementTitle}</strong>
                </div>
                <RiskBadge level={group.risk} />
                <StatusBadge status={group.requirementStatus} />
                <footer>
                  <span>{group.candidates.length} 个候选</span>
                  <em>{group.selectedEvidenceIds.length} 个已接受</em>
                  <ChevronRight size={12} />
                </footer>
              </button>
            ))}
          </div>
        </section>
        <section className="panel candidate-panel">
          <div className="candidate-heading">
            <div>
              <span>{selected.requirementCode} · 证据候选</span>
              <h2>{selected.requirementTitle}</h2>
            </div>
            <StatusBadge status={selected.requirementStatus} />
          </div>
          <div className="candidate-list">
            {selected.candidates.map((candidate) => (
              <article
                key={candidate.id}
                className={`candidate-card ${candidate.decision}`}
                draggable
                onDragStart={() => setDragCandidate(candidate)}
                onDragEnd={() => setDragCandidate(null)}
              >
                <header>
                  <GripVertical size={14} />
                  <span className="candidate-file">
                    <FileText size={17} />
                  </span>
                  <div>
                    <strong>{candidate.name}</strong>
                    <small>{candidate.legalEntity}</small>
                  </div>
                  <span
                    className={`match-score-large ${candidate.score >= 0.9 ? "high" : candidate.score >= 0.7 ? "medium" : "low"}`}
                  >
                    <Sparkles size={12} />
                    {Math.round(candidate.score * 100)}%
                  </span>
                </header>
                <div className="candidate-meta">
                  <span>
                    <small>有效期</small>
                    <strong
                      className={
                        candidate.reason.some((reason) =>
                          reason.includes("过期"),
                        )
                          ? "danger-text"
                          : ""
                      }
                    >
                      {candidate.validUntil}
                    </strong>
                  </span>
                  <span>
                    <small>材料完整度</small>
                    <strong>{candidate.completeness}%</strong>
                  </span>
                  <span>
                    <small>当前决策</small>
                    <strong>
                      {candidate.decision === "accepted"
                        ? "已接受"
                        : candidate.decision === "rejected"
                          ? "已拒绝"
                          : "待确认"}
                    </strong>
                  </span>
                </div>
                <section>
                  <h3>匹配理由</h3>
                  <ul>
                    {candidate.reason.map((reason) => (
                      <li key={reason}>
                        <Check size={11} />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </section>
                <footer>
                  <button
                    className="button small"
                    type="button"
                    onClick={() => setSourceCandidate(candidate)}
                  >
                    <FileText size={12} />
                    查看来源
                  </button>
                  <span />
                  <button
                    className="button danger small"
                    type="button"
                    disabled={candidate.decision === "rejected"}
                    onClick={() => {
                      setRejectCandidate(candidate);
                      setRejectReason("");
                    }}
                  >
                    <X size={12} />
                    拒绝
                  </button>
                  <button
                    className="button primary small"
                    type="button"
                    disabled={candidate.decision === "accepted"}
                    onClick={() => decide(candidate, "accept")}
                  >
                    <Check size={12} />
                    接受证据
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </section>
      </div>
      {bulkOpen && (
        <div className="dialog-backdrop">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="批量确认高置信度"
          >
            <div className="dialog-title">
              <h2>批量确认高置信度</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setBulkOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
            <p>
              将人工接受 {eligibleCount} 个分数不低于
              90%、未发现过期线索且仍待确认的候选。其他候选保持不变。
            </p>
            <div className="dialog-warning">
              <AlertTriangle size={14} />
              高置信度不等于准确；本操作会逐项留下人工接受记录。
            </div>
            <div className="dialog-actions">
              <button
                className="button"
                type="button"
                onClick={() => setBulkOpen(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="button"
                disabled={!eligibleCount}
                onClick={bulkConfirm}
              >
                确认接受 {eligibleCount} 个
              </button>
            </div>
          </div>
        </div>
      )}
      {rejectCandidate && (
        <div className="dialog-backdrop">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="拒绝证据匹配"
          >
            <div className="dialog-title">
              <div>
                <h2>拒绝证据匹配</h2>
                <p>{rejectCandidate.name}</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setRejectCandidate(null)}
              >
                <X size={14} />
              </button>
            </div>
            <label className="form-field">
              <span>
                拒绝原因 <em>必填</em>
              </span>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="主体不一致、已过期、内容不足或其他可复核原因"
              />
            </label>
            <div className="dialog-actions">
              <button
                className="button"
                type="button"
                onClick={() => setRejectCandidate(null)}
              >
                取消
              </button>
              <button
                className="button danger"
                type="button"
                disabled={!rejectReason.trim()}
                onClick={() => decide(rejectCandidate, "reject", rejectReason)}
              >
                记录原因并拒绝
              </button>
            </div>
          </div>
        </div>
      )}
      <DocumentDialog
        open={Boolean(sourceCandidate)}
        onClose={() => setSourceCandidate(null)}
        title="候选证据来源"
      >
        {sourceCandidate && (
          <DocumentViewer
            name={sourceCandidate.name}
            initialPage={1}
            pageCount={2}
            excerpt={sourceCandidate.reason.join("；")}
            focusLabel={`${Math.round(sourceCandidate.score * 100)}% 匹配候选`}
            sourceLocation={`${sourceCandidate.legalEntity} · Claim 来源页`}
            demo
          />
        )}
      </DocumentDialog>
    </div>
  );
}
