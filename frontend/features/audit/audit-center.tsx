"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  ChevronRight,
  Download,
  Filter,
  History,
  List,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { RiskBadge } from "@/components/ui/badges";
import type { AuditRecord, DataSource } from "@/lib/phase-data/types";
import { phaseApi } from "@/lib/api/phase2";
import {
  MutationFeedback,
  type MutationResult,
} from "@/components/feedback/mutation-feedback";

export function AuditCenter({
  projectId,
  initialRecords,
  source,
}: {
  projectId: string;
  initialRecords: AuditRecord[];
  source: DataSource;
}) {
  const [view, setView] = useState<"timeline" | "table">("timeline");
  const [query, setQuery] = useState("");
  const [actorType, setActorType] = useState("all");
  const [risk, setRisk] = useState("all");
  const [selectedId, setSelectedId] = useState(initialRecords[0]?.id);
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const selected =
    initialRecords.find((item) => item.id === selectedId) ?? initialRecords[0];
  const filtered = useMemo(
    () =>
      initialRecords.filter(
        (record) =>
          `${record.actor}${record.action}${record.entityLabel}${record.modelOrRule}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (actorType === "all" || record.actorType === actorType) &&
          (risk === "all" || record.risk === risk),
      ),
    [actorType, initialRecords, query, risk],
  );
  async function exportAudit() {
    if (source === "api") {
      try {
        const blob = await phaseApi.exportAudit(projectId);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "项目审计记录_后端只读导出.json";
        anchor.click();
        URL.revokeObjectURL(url);
        setFeedback({
          source: "api",
          persisted: false,
          status: "success",
          title: "只读审计已导出",
          message: "导出来自 API，没有修改任何审计或业务记录。",
        });
      } catch (error) {
        setFeedback({
          source: "api",
          persisted: false,
          status: "error",
          title: "审计导出失败",
          message: error instanceof Error ? error.message : "未知错误",
        });
      }
      return;
    }
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              exported_at: new Date().toISOString(),
              readonly: true,
              filters: { query, actorType, risk },
              records: filtered,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "项目审计记录_只读.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback({
      source: "demo",
      persisted: false,
      status: "warning",
      title: "演示审计已导出",
      message: "导出来自当前确定性演示视图，没有写入后端。",
    });
  }
  if (!selected) return null;
  return (
    <div className="page audit-page">
      <header className="page-header">
        <div className="page-title-group">
          <h1>全过程审计</h1>
          <p>模型运行、确定性规则和人工纠正均以追加方式记录；审计页只读。</p>
        </div>
        <div className="header-actions">
          <span className={`data-source ${source}`}>
            {source === "api" ? "API 数据" : "本地演示数据"}
          </span>
          <button className="button" type="button" onClick={exportAudit}>
            <Download size={14} />
            只读导出
          </button>
        </div>
      </header>
      <section className="audit-assurance">
        <ShieldCheck size={17} />
        <span>
          <strong>追加式审计保障</strong>
          <small>
            当前视图不会修改业务数据；导出包含筛选条件、输入输出哈希和人工覆盖原因。
          </small>
        </span>
        <div>
          <strong>{initialRecords.length}</strong>
          <small>事件总数</small>
        </div>
        <div>
          <strong>
            {initialRecords.filter((item) => item.humanOverride).length}
          </strong>
          <small>人工覆盖</small>
        </div>
        <div>
          <strong>
            {initialRecords.filter((item) => item.actorType === "agent").length}
          </strong>
          <small>模型运行</small>
        </div>
      </section>
      <MutationFeedback result={feedback} />
      <section className="panel audit-toolbar">
        <label>
          <Search size={13} />
          <input
            aria-label="搜索审计记录"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索人员、动作、对象、模型或规则"
          />
        </label>
        <span>
          <Filter size={12} />
          筛选
        </span>
        <select
          aria-label="操作者类型"
          value={actorType}
          onChange={(event) => {
            const next = event.target.value;
            setActorType(next);
            const first = initialRecords.find(
              (record) => next === "all" || record.actorType === next,
            );
            if (first) setSelectedId(first.id);
          }}
        >
          <option value="all">全部操作者</option>
          <option value="human">人员</option>
          <option value="agent">Agent / 模型</option>
          <option value="rule">规则引擎</option>
        </select>
        <select
          aria-label="风险级别"
          value={risk}
          onChange={(event) => {
            const next = event.target.value;
            setRisk(next);
            const first = initialRecords.find(
              (record) => next === "all" || record.risk === next,
            );
            if (first) setSelectedId(first.id);
          }}
        >
          <option value="all">全部风险</option>
          <option value="fatal">致命</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <button
          className="button small"
          type="button"
          onClick={() => {
            setQuery("");
            setActorType("all");
            setRisk("all");
            setSelectedId(initialRecords[0]?.id);
          }}
        >
          清除筛选
        </button>
        <em>{filtered.length} 条记录</em>
        <span className="view-toggle">
          <button
            className={view === "timeline" ? "active" : ""}
            type="button"
            aria-label="时间线视图"
            onClick={() => setView("timeline")}
          >
            <History size={13} />
          </button>
          <button
            className={view === "table" ? "active" : ""}
            type="button"
            aria-label="表格视图"
            onClick={() => setView("table")}
          >
            <List size={13} />
          </button>
        </span>
      </section>
      <div className="audit-layout">
        <section className="panel audit-records">
          {view === "timeline" ? (
            <ol className="audit-timeline">
              {filtered.map((record, index) => (
                <li
                  key={record.id}
                  className={record.id === selected.id ? "selected" : ""}
                  onClick={() => setSelectedId(record.id)}
                >
                  <time>
                    {record.timestamp.split(" ")[0]}
                    <strong>{record.timestamp.split(" ")[1]}</strong>
                  </time>
                  <span className={`audit-actor-icon ${record.actorType}`}>
                    {record.actorType === "human" ? (
                      <UserRound size={13} />
                    ) : record.actorType === "agent" ? (
                      <Bot size={13} />
                    ) : (
                      <ShieldCheck size={13} />
                    )}
                  </span>
                  <article>
                    <header>
                      <strong>{record.actor}</strong>
                      <span>
                        {record.actorType === "human"
                          ? "人员"
                          : record.actorType === "agent"
                            ? "Agent"
                            : "规则"}
                      </span>
                      <RiskBadge level={record.risk} />
                    </header>
                    <h2>{record.action}</h2>
                    <p>
                      {record.entityType} · {record.entityLabel}
                    </p>
                    <footer>
                      <span>{record.modelOrRule}</span>
                      {record.humanOverride && <em>人工覆盖</em>}
                      <ChevronRight size={12} />
                    </footer>
                  </article>
                  {index < filtered.length - 1 && <i />}
                </li>
              ))}
            </ol>
          ) : (
            <div className="audit-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作者</th>
                    <th>动作</th>
                    <th>对象</th>
                    <th>模型 / 规则</th>
                    <th>人工覆盖</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => (
                    <tr
                      key={record.id}
                      onClick={() => setSelectedId(record.id)}
                    >
                      <td>{record.timestamp}</td>
                      <td>{record.actor}</td>
                      <td>{record.action}</td>
                      <td>{record.entityLabel}</td>
                      <td>{record.modelOrRule}</td>
                      <td>{record.humanOverride ? "是" : "否"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="panel audit-detail">
          <header>
            <span className={`audit-actor-icon ${selected.actorType}`}>
              {selected.actorType === "human" ? (
                <UserRound size={15} />
              ) : selected.actorType === "agent" ? (
                <Bot size={15} />
              ) : (
                <ShieldCheck size={15} />
              )}
            </span>
            <div>
              <strong>{selected.action}</strong>
              <small>
                {selected.timestamp} · {selected.actor}
              </small>
            </div>
            <RiskBadge level={selected.risk} />
          </header>
          <dl>
            <div>
              <dt>实体类型</dt>
              <dd>{selected.entityType}</dd>
            </div>
            <div>
              <dt>实体 ID</dt>
              <dd>{selected.entityId}</dd>
            </div>
            <div>
              <dt>模型 / 规则</dt>
              <dd>{selected.modelOrRule}</dd>
            </div>
            <div>
              <dt>Prompt 版本</dt>
              <dd>{selected.promptVersion}</dd>
            </div>
          </dl>
          <section>
            <h3>修改前</h3>
            <pre>{selected.before}</pre>
          </section>
          <section>
            <h3>修改后</h3>
            <pre>{selected.after}</pre>
          </section>
          <section>
            <h3>原因</h3>
            <p>{selected.reason}</p>
          </section>
          <section className="hash-block">
            <h3>完整性哈希</h3>
            <p>
              <span>输入</span>
              <code>{selected.inputHash}</code>
            </p>
            <p>
              <span>输出</span>
              <code>{selected.outputHash}</code>
            </p>
          </section>
          {selected.humanOverride && (
            <div className="override-flag">
              <X size={12} />
              <span>
                <strong>人工覆盖</strong>
                <small>原始自动结果仍被保留。</small>
              </span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
