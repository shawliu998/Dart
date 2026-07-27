"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { RiskBadge } from "@/components/ui/badges";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import {
  MutationFeedback,
  type MutationResult,
} from "@/components/feedback/mutation-feedback";
import {
  DocumentDialog,
  DocumentViewer,
} from "@/components/documents/document-viewer";
import { apiRequest } from "@/lib/api/client";
import type { DataSource } from "@/lib/phase-data/types";
import type { DisqualificationItem } from "@/lib/types";

const statusMeta = {
  candidate: { label: "AI 候选", className: "candidate" },
  rule_hit: { label: "规则命中", className: "rule-hit" },
  confirmed: { label: "人工确认", className: "confirmed" },
  resolved: { label: "已经解决", className: "resolved" },
  waived: { label: "已豁免", className: "waived" },
};

export function DisqualificationCenter({
  projectId,
  initialItems,
  source = "demo",
}: {
  projectId: string;
  initialItems: DisqualificationItem[];
  source?: DataSource;
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState(initialItems[0]?.id);
  const [pending, setPending] = useState<{
    id: string;
    next: DisqualificationItem["status"];
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const [sourceItem, setSourceItem] = useState<DisqualificationItem | null>(
    null,
  );
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (status === "all" || item.status === status) &&
          `${item.title}${item.trigger}${item.source}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [items, query, status],
  );

  async function update(id: string, next: DisqualificationItem["status"]) {
    const verb =
      next === "confirmed"
        ? "人工确认"
        : next === "resolved"
          ? "标记解决"
          : "驳回候选";
    if (source === "api") {
      if (next === "resolved") {
        setFeedback({
          source: "api",
          persisted: false,
          status: "error",
          title: "后端未提供解决接口",
          message: "当前状态未更改；请先创建整改任务并由后端工作流完成关闭。",
        });
        setDecisionReason("");
        setPending(null);
        return;
      }
      try {
        await apiRequest(
          `/api/disqualifications/${id}/${next === "confirmed" ? "confirm" : "reject"}`,
          {
            method: "POST",
            body: JSON.stringify({
              reason: decisionReason.trim(),
            }),
          },
        );
      } catch (error) {
        setFeedback({
          source: "api",
          persisted: false,
          status: "error",
          title: `${verb}失败`,
          message: error instanceof Error ? error.message : "未知错误",
        });
        setDecisionReason("");
        setPending(null);
        return;
      }
    }
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: next } : item,
      ),
    );
    setFeedback({
      source,
      persisted: source === "api",
      status: source === "api" ? "success" : "warning",
      title: `${verb}完成`,
      message:
        source === "api"
          ? "决定已写入 API 并保留审计原因。"
          : "仅更新本地演示状态，未写入后端。",
    });
    setDecisionReason("");
    setPending(null);
  }

  async function redetect() {
    if (source === "api") {
      try {
        await apiRequest(
          `/api/projects/${projectId}/disqualifications/detect`,
          { method: "POST", body: JSON.stringify({}) },
        );
        setFeedback({
          source: "api",
          persisted: true,
          status: "success",
          title: "重新检测已提交",
          message: "检测任务已进入后端队列；候选仍须人工确认。",
        });
      } catch (error) {
        setFeedback({
          source: "api",
          persisted: false,
          status: "error",
          title: "重新检测失败",
          message: error instanceof Error ? error.message : "未知错误",
        });
      }
    } else
      setFeedback({
        source: "demo",
        persisted: false,
        status: "warning",
        title: "演示检测已完成",
        message: `当前 ${items.length} 个候选中 ${items.filter((item) => item.status === "rule_hit").length} 个规则命中、${items.filter((item) => item.status === "candidate").length} 个待人工确认。`,
      });
  }

  return (
    <div className="page disqualification-page">
      <header className="page-header">
        <div className="page-title-group">
          <Link className="back-link" href="../overview">
            <ArrowLeft size={14} />
            返回项目总览
          </Link>
          <h1>否决项中心</h1>
          <p>
            将 AI
            候选、确定性规则命中与人工结论明确分离，避免自动作出法律资格判断。
          </p>
        </div>
        <button className="button primary" type="button" onClick={redetect}>
          <ShieldCheck size={15} />
          重新检测
        </button>
      </header>
      <section className="dq-summary" aria-label="否决项概况">
        <article className="critical">
          <AlertOctagon size={18} />
          <span>
            <strong>
              {
                items.filter(
                  (item) =>
                    item.status === "confirmed" || item.status === "rule_hit",
                ).length
              }
            </strong>
            <small>已确认 / 规则命中</small>
          </span>
        </article>
        <article>
          <AlertTriangle size={18} />
          <span>
            <strong>
              {items.filter((item) => item.status === "candidate").length}
            </strong>
            <small>待人工确认</small>
          </span>
        </article>
        <article>
          <CheckCircle2 size={18} />
          <span>
            <strong>
              {items.filter((item) => item.status === "resolved").length}
            </strong>
            <small>已解决</small>
          </span>
        </article>
        <div className="dq-guidance">
          <strong>
            当前建议：
            {items.some((item) =>
              ["confirmed", "rule_hit"].includes(item.status),
            )
              ? "暂停进入文件封装"
              : "继续人工复核候选"}
          </strong>
          <p>规则命中不等于法律结论；所有候选均需由授权人员确认。</p>
        </div>
      </section>
      <MutationFeedback result={feedback} />
      <section className="panel">
        <div className="toolbar">
          <label className="search-field">
            <Search size={14} />
            <input
              aria-label="搜索否决项"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索风险、条款或证据"
            />
          </label>
          <label className="dq-select">
            <span className="sr-only">按状态筛选</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">全部状态</option>
              <option value="rule_hit">规则命中</option>
              <option value="candidate">AI 候选</option>
              <option value="confirmed">人工确认</option>
              <option value="resolved">已经解决</option>
            </select>
            <ChevronDown size={13} />
          </label>
          <span className="toolbar-spacer" />
          <span className="result-count">
            显示 {filtered.length} / {items.length} 项
          </span>
        </div>
        <div className="dq-list">
          {filtered.map((item) => {
            const meta = statusMeta[item.status];
            const open = openId === item.id;
            return (
              <article
                key={item.id}
                className={`dq-item ${open ? "open" : ""}`}
              >
                <button
                  className="dq-item-head"
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? "" : item.id)}
                >
                  <span className={`dq-origin ${meta.className}`}>
                    {item.status === "rule_hit" ? (
                      <ShieldCheck size={12} />
                    ) : item.status === "resolved" ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <AlertTriangle size={12} />
                    )}
                    {meta.label}
                  </span>
                  <span className="dq-title">
                    <strong>{item.title}</strong>
                    <small>
                      <FileText size={11} />
                      {item.source} · 第 {item.page} 页
                    </small>
                  </span>
                  <RiskBadge level={item.risk} />
                  <span className="dq-person">
                    <UserRound size={12} />
                    {item.owner}
                    <small>{item.dueDate}</small>
                  </span>
                  <ChevronDown className="dq-chevron" size={15} />
                </button>
                {open && (
                  <div className="dq-detail">
                    <dl>
                      <div>
                        <dt>触发条件</dt>
                        <dd>{item.trigger}</dd>
                      </div>
                      <div>
                        <dt>当前证据</dt>
                        <dd>{item.evidence}</dd>
                      </div>
                      <div>
                        <dt>当前响应</dt>
                        <dd>{item.response}</dd>
                      </div>
                      <div>
                        <dt>整改措施</dt>
                        <dd>{item.remediation}</dd>
                      </div>
                      <div>
                        <dt>审批人</dt>
                        <dd>{item.approver}</dd>
                      </div>
                    </dl>
                    <div className="dq-actions">
                      <button
                        className="button small"
                        type="button"
                        onClick={() => setSourceItem(item)}
                      >
                        <FileText size={13} />
                        查看原文
                      </button>
                      {item.status === "candidate" && (
                        <>
                          <button
                            className="button small"
                            type="button"
                            onClick={() =>
                              setPending({ id: item.id, next: "waived" })
                            }
                          >
                            <X size={13} />
                            驳回候选
                          </button>
                          <button
                            className="button danger small"
                            type="button"
                            onClick={() =>
                              setPending({ id: item.id, next: "confirmed" })
                            }
                          >
                            <AlertOctagon size={13} />
                            人工确认
                          </button>
                        </>
                      )}
                      {(item.status === "rule_hit" ||
                        item.status === "confirmed") && (
                        <button
                          className="button primary small"
                          type="button"
                          onClick={() =>
                            setPending({ id: item.id, next: "resolved" })
                          }
                        >
                          <Check size={13} />
                          标记已解决
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {filtered.length === 0 && (
            <div className="empty-state">
              <strong>没有匹配的否决项</strong>请调整搜索或筛选条件。
            </div>
          )}
        </div>
      </section>
      <ConfirmDialog
        open={Boolean(pending)}
        title="确认人工否决项操作"
        description="该操作会记录人工决定；规则或 AI 候选不会自动成为法律资格结论。"
        confirmLabel="确认并记录"
        tone={pending?.next === "confirmed" ? "danger" : "default"}
        reason={{
          label: "决定理由",
          value: decisionReason,
          onChange: setDecisionReason,
          placeholder: "说明核对的原文、证据及作出该决定的依据。",
        }}
        onClose={() => {
          setPending(null);
          setDecisionReason("");
        }}
        onConfirm={() => pending && update(pending.id, pending.next)}
      />
      <DocumentDialog
        open={Boolean(sourceItem)}
        onClose={() => setSourceItem(null)}
        title="否决项来源"
      >
        {sourceItem && (
          <DocumentViewer
            name={sourceItem.source}
            initialPage={sourceItem.page}
            pageCount={Math.max(sourceItem.page, 1)}
            excerpt={sourceItem.trigger}
            focusLabel={sourceItem.title}
            sourceLocation={`第 ${sourceItem.page} 页`}
            demo
          />
        )}
      </DocumentDialog>
    </div>
  );
}
