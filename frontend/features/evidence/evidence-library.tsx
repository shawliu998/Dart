"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileSearch,
  FileText,
  Folder,
  History,
  LoaderCircle,
  Play,
  Search,
  ShieldAlert,
  Tag,
  Upload,
  UsersRound,
  XCircle,
} from "lucide-react";
import { ConfidenceIndicator } from "@/components/ui/badges";
import { DocumentViewer } from "@/components/documents/document-viewer";
import {
  MutationFeedback,
  type MutationResult,
} from "@/components/feedback/mutation-feedback";
import type { DataSource, EvidenceAsset } from "@/lib/phase-data/types";
import styles from "./evidence-library-v2.module.css";

const statusLabel = {
  verified: "已人工验证",
  review: "待人工验证",
  expired: "已过期",
  conflict: "存在冲突",
};
type ParseQueueItem = {
  id: string;
  name: string;
  status: "queued" | "parsing" | "review" | "failed";
  progress: number;
  detail: string;
};
const localFeedback = (message: string): MutationResult => ({
  source: "demo",
  persisted: false,
  status: "warning",
  title: "本地演示操作",
  message,
});

export function EvidenceLibrary({
  initialAssets,
  source,
  error,
}: {
  initialAssets: EvidenceAsset[];
  source: DataSource;
  error?: string;
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [selectedId, setSelectedId] = useState(initialAssets[0]?.id);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [tab, setTab] = useState<"preview" | "claims" | "usage" | "history">(
    "claims",
  );
  const [previewPage, setPreviewPage] = useState(1);
  const [queue, setQueue] = useState<ParseQueueItem[]>([]);
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const selected = assets.find((item) => item.id === selectedId) ?? assets[0];
  const filtered = useMemo(
    () =>
      assets.filter(
        (item) =>
          `${item.name}${item.tags.join("")}${item.legalEntity}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (type === "all" || item.type === type) &&
          (status === "all" || item.status === status),
      ),
    [assets, query, status, type],
  );
  const types = Array.from(new Set(assets.map((item) => item.type)));

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const uploaded = Array.from(files).map((file, index): EvidenceAsset => ({
      id: `local-${Date.now()}-${index}`,
      name: file.name,
      type: "待分类",
      legalEntity: "主体待确认",
      status: "review",
      validUntil: "待提取",
      expiryDays: 0,
      claimCount: 0,
      usageCount: 0,
      owner: "刘敏",
      department: "待分配",
      lastReviewed: "未复核",
      tags: ["本地上传"],
      pageCount: 0,
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      version: "V1",
      claims: [],
      usedBy: [],
    }));
    setAssets((current) => [...uploaded, ...current]);
    setSelectedId(uploaded[0].id);
    setQueue((current) => [
      ...uploaded.map((item) => ({
        id: item.id,
        name: item.name,
        status: "queued" as const,
        progress: 0,
        detail: "等待本地演示解析",
      })),
      ...current,
    ]);
    setFeedback(
      localFeedback(
        `已将 ${uploaded.length} 份材料加入解析队列；尚未上传后端。`,
      ),
    );
  }

  function advanceQueue(id: string) {
    setQueue((current) =>
      current.map((item) =>
        item.id !== id
          ? item
          : item.status === "queued"
            ? {
                ...item,
                status: "parsing",
                progress: 45,
                detail: "正在提取页码与候选 Claim",
              }
            : item.status === "parsing"
              ? {
                  ...item,
                  status: "review",
                  progress: 100,
                  detail: "解析完成，等待人工核验 Claim",
                }
              : item,
      ),
    );
    const item = queue.find((entry) => entry.id === id);
    setFeedback(
      localFeedback(
        item?.status === "queued"
          ? "已启动演示解析；不会调用真实模型。"
          : "解析结果已进入人工复核队列。",
      ),
    );
  }

  function exportInventory() {
    const rows = [
      ["材料名称", "类型", "主体", "状态", "有效期", "负责人"],
      ...filtered.map((item) => [
        item.name,
        item.type,
        item.legalEntity,
        statusLabel[item.status],
        item.validUntil,
        item.owner,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${rows.map((row) => row.join(",")).join("\n")}`], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "企业材料清单.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (error && source === "api") {
    return (
      <div className="page evidence-page">
        <header className="page-header">
          <div className="page-title-group">
            <h1>企业材料库</h1>
            <p>将证书、主体、人员与项目案例维护为可复用、可验证的企业证据。</p>
          </div>
          <span className="data-source api">API 数据不可用</span>
        </header>
        <section className="panel empty-state" role="alert" aria-live="assertive">
          <AlertTriangle size={20} aria-hidden="true" />
          <strong>企业材料数据暂时不可用</strong>
          <p>未能从 API 读取企业材料。请检查本地服务后重试；当前页面不会显示替代数据。</p>
          <button className="button" type="button" onClick={() => window.location.reload()}>
            重试读取
          </button>
        </section>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="page evidence-page">
        <header className="page-header">
          <div className="page-title-group">
            <h1>企业材料库</h1>
            <p>将证书、主体、人员与项目案例维护为可复用、可验证的企业证据。</p>
          </div>
          <span className={`data-source ${source}`}>
            {source === "api" ? "API 数据" : "本地演示数据"}
          </span>
        </header>
        <section className="panel empty-state">
          <FileSearch size={20} aria-hidden="true" />
          <strong>尚未上传企业材料</strong>
          <p>上传材料后，可由后端解析并进入人工核验流程。</p>
        </section>
      </div>
    );
  }
  return (
    <div className="page evidence-page">
      <header className="page-header">
        <div className="page-title-group">
          <h1>企业材料库</h1>
          <p>将证书、主体、人员与项目案例维护为可复用、可验证的企业证据。</p>
        </div>
        <div className="header-actions">
          <span className={`data-source ${source}`}>
            {source === "api" ? "API 数据" : "本地演示数据"}
          </span>
          <button className="button" type="button" onClick={exportInventory}>
            <Download size={14} />
            导出清单
          </button>
          <label className="button primary">
            <Upload size={14} />
            上传材料
            <input
              className="sr-only"
              type="file"
              multiple
              onChange={(event) => addFiles(event.target.files)}
            />
          </label>
        </div>
      </header>
      <section className="evidence-alerts" aria-label="材料提醒">
        <EvidenceAlert
          icon={<CalendarClock />}
          value={String(
            assets.filter(
              (item) => item.expiryDays >= 0 && item.expiryDays <= 30,
            ).length,
          )}
          label="30 天内到期"
          tone="danger"
          onClick={() => setStatus("review")}
        />
        <EvidenceAlert
          icon={<Clock3 />}
          value={String(
            assets.filter(
              (item) => item.expiryDays > 30 && item.expiryDays <= 90,
            ).length,
          )}
          label="90 天内到期"
          onClick={() => setStatus("review")}
        />
        <EvidenceAlert
          icon={<UsersRound />}
          value={String(
            assets.filter((item) => item.legalEntity === "主体待确认").length,
          )}
          label="缺少主体"
          onClick={() => setQuery("主体待确认")}
        />
        <EvidenceAlert
          icon={<FileSearch />}
          value={String(
            assets.filter((item) => item.status === "review").length,
          )}
          label="未经人工验证"
          onClick={() => setStatus("review")}
        />
        <EvidenceAlert
          icon={<ShieldAlert />}
          value={String(
            assets.filter((item) => item.status === "conflict").length,
          )}
          label="存在冲突"
          tone="danger"
          onClick={() => setStatus("conflict")}
        />
        <EvidenceAlert
          icon={<History />}
          value={String(
            assets.filter((item) => item.lastReviewed === "未复核").length,
          )}
          label="长期未复核"
          onClick={() => setQuery("未复核")}
        />
      </section>
      <MutationFeedback result={feedback} />
      {queue.length > 0 && (
        <section className={`panel ${styles.queue}`} aria-label="材料解析队列">
          <div className="panel-header">
            <div>
              <h2>材料解析队列</h2>
              <p>上传、页码识别、Claim 候选与人工复核状态明确分离</p>
            </div>
            <span>
              {queue.filter((item) => item.status !== "review").length} 项处理中
            </span>
          </div>
          <div>
            {queue.map((item) => (
              <article key={item.id}>
                <strong>{item.name}</strong>
                <span>
                  {item.status === "queued"
                    ? "排队中"
                    : item.status === "parsing"
                      ? "解析中"
                      : item.status === "review"
                        ? "待人工核验"
                        : "失败"}
                </span>
                <div>
                  <progress max={100} value={item.progress} />
                  <small>{item.detail}</small>
                </div>
                {item.status === "queued" || item.status === "parsing" ? (
                  <button
                    className="button small"
                    type="button"
                    onClick={() => advanceQueue(item.id)}
                  >
                    {item.status === "queued" ? (
                      <Play size={12} />
                    ) : (
                      <LoaderCircle size={12} />
                    )}
                    {item.status === "queued" ? "开始解析" : "完成演示解析"}
                  </button>
                ) : (
                  <CheckCircle2 size={15} />
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="evidence-layout">
        <aside className="panel evidence-sidebar">
          <h2>材料范围</h2>
          <label className="evidence-search">
            <Search size={14} />
            <input
              aria-label="搜索企业材料"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文件、标签、主体"
            />
          </label>
          <section>
            <h3>
              <Folder size={13} />
              材料类型
            </h3>
            <button
              className={type === "all" ? "active" : ""}
              type="button"
              onClick={() => setType("all")}
            >
              <span>全部材料</span>
              <em>{assets.length}</em>
            </button>
            {types.map((item) => (
              <button
                key={item}
                className={type === item ? "active" : ""}
                type="button"
                onClick={() => setType(item)}
              >
                <span>{item}</span>
                <em>{assets.filter((asset) => asset.type === item).length}</em>
              </button>
            ))}
          </section>
          <section>
            <h3>
              <Tag size={13} />
              状态
            </h3>
            {Object.entries(statusLabel).map(([key, label]) => (
              <button
                key={key}
                className={status === key ? "active" : ""}
                type="button"
                onClick={() => setStatus(status === key ? "all" : key)}
              >
                <span>{label}</span>
                <em>{assets.filter((asset) => asset.status === key).length}</em>
              </button>
            ))}
          </section>
          {(query || type !== "all" || status !== "all") && (
            <button
              className="button small full-width"
              type="button"
              onClick={() => {
                setQuery("");
                setType("all");
                setStatus("all");
              }}
            >
              清除筛选
            </button>
          )}
        </aside>
        <section className="panel evidence-list-panel">
          <div className="panel-header">
            <div>
              <h2>材料清单</h2>
              <p>
                {filtered.length} 份材料 ·{" "}
                {filtered.reduce((sum, item) => sum + item.claimCount, 0)}{" "}
                个可引用 Claim
              </p>
            </div>
            <span>
              最近复核：
              {assets.find((item) => item.lastReviewed !== "未复核")
                ?.lastReviewed ?? "暂无"}
            </span>
          </div>
          <div className="evidence-table-wrap">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>材料</th>
                  <th>主体 / 部门</th>
                  <th>有效期</th>
                  <th>状态</th>
                  <th>使用</th>
                  <th>负责人</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((asset) => (
                  <tr
                    key={asset.id}
                    className={asset.id === selected.id ? "selected" : ""}
                    onClick={() => setSelectedId(asset.id)}
                  >
                    <td>
                      <span className="asset-icon">
                        <FileText size={15} />
                      </span>
                      <span>
                        <strong>{asset.name}</strong>
                        <small>
                          {asset.type} · {asset.version} · {asset.size}
                        </small>
                      </span>
                    </td>
                    <td>
                      <strong>{asset.legalEntity}</strong>
                      <small>{asset.department}</small>
                    </td>
                    <td>
                      <strong>{asset.validUntil}</strong>
                      <small
                        className={asset.expiryDays < 0 ? "danger-text" : ""}
                      >
                        {asset.expiryDays < 0
                          ? `已过期 ${Math.abs(asset.expiryDays)} 天`
                          : asset.expiryDays < 90
                            ? `${asset.expiryDays} 天后到期`
                            : "有效"}
                      </small>
                    </td>
                    <td>
                      <span className={`asset-status ${asset.status}`}>
                        {asset.status === "verified" ? (
                          <CheckCircle2 size={11} />
                        ) : asset.status === "expired" ||
                          asset.status === "conflict" ? (
                          <XCircle size={11} />
                        ) : (
                          <AlertTriangle size={11} />
                        )}
                        {statusLabel[asset.status]}
                      </span>
                    </td>
                    <td>
                      <strong>{asset.usageCount} 个项目</strong>
                      <small>{asset.claimCount} 个 Claim</small>
                    </td>
                    <td>
                      <strong>{asset.owner}</strong>
                      <small>{asset.lastReviewed}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty-state">
                <strong>没有匹配的企业材料</strong>调整范围或上传新材料。
              </div>
            )}
          </div>
        </section>
        <aside className="panel evidence-detail">
          <div className="evidence-detail-head">
            <span className="asset-icon large">
              <FileText size={20} />
            </span>
            <div>
              <strong>{selected.name}</strong>
              <small>
                {selected.version} · {selected.pageCount} 页 · {selected.size}
              </small>
            </div>
            <span className={`asset-status ${selected.status}`}>
              {statusLabel[selected.status]}
            </span>
          </div>
          <div className="detail-tabs evidence-tabs" role="tablist">
            {(
              [
                ["preview", "预览"],
                ["claims", "Claims"],
                ["usage", "使用项目"],
                ["history", "版本"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                role="tab"
                aria-selected={tab === key}
                type="button"
                onClick={() => setTab(key)}
              >
                {label}
                {key === "claims" && <span>{selected.claims.length}</span>}
              </button>
            ))}
          </div>
          <div className="evidence-detail-body">
            {tab === "claims" && (
              <div className="claims-list">
                <div className="claims-summary">
                  <strong>{selected.claims.length} 个结构化 Claim</strong>
                  <small>每项均保留来源页与置信度</small>
                </div>
                {selected.claims.map((claim) => (
                  <article
                    key={claim.id}
                    className={claim.conflict ? "conflict" : ""}
                  >
                    <div>
                      <span>{claim.label}</span>
                      <strong>{claim.value}</strong>
                    </div>
                    <p>可证明：{claim.proves}</p>
                    <footer>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPage(claim.page);
                          setTab("preview");
                        }}
                      >
                        第 {claim.page} 页 <ChevronRight size={11} />
                      </button>
                      <ConfidenceIndicator value={claim.confidence} />
                    </footer>
                    {claim.conflict && (
                      <aside>
                        <AlertTriangle size={12} />
                        {claim.conflict}
                      </aside>
                    )}
                  </article>
                ))}
                {selected.claims.length === 0 && (
                  <div className="empty-state">
                    <strong>尚未抽取 Claim</strong>
                    本地上传材料需连接后端解析后抽取。
                  </div>
                )}
              </div>
            )}
            {tab === "preview" && (
              <DocumentViewer
                key={`${selected.id}-${previewPage}`}
                name={selected.name}
                state={selected.pageCount === 0 ? "loading" : "ready"}
                initialPage={previewPage}
                pageCount={selected.pageCount || 1}
                excerpt={
                  selected.claims.find((claim) => claim.page === previewPage)
                    ?.value
                }
                focusLabel={
                  selected.claims.find((claim) => claim.page === previewPage)
                    ?.label
                }
                sourceLocation={`${selected.version} · ${selected.legalEntity}`}
                demo
              />
            )}
            {tab === "usage" && (
              <div className="usage-list">
                <h3>已关联项目</h3>
                {selected.usedBy.map((project) => (
                  <p key={project}>
                    <span>
                      <strong>{project}</strong>
                      <small>证据引用正在使用</small>
                    </span>
                    <ChevronRight size={13} />
                  </p>
                ))}
                {!selected.usedBy.length && (
                  <div className="empty-state">
                    <strong>尚未被项目使用</strong>可在证据匹配工作台建立关联。
                  </div>
                )}
              </div>
            )}
            {tab === "history" && (
              <div className="version-list">
                <h3>版本历史</h3>
                <p>
                  <span>{selected.version}</span>
                  <strong>当前版本</strong>
                  <small>
                    {selected.lastReviewed} · {selected.owner} 复核
                  </small>
                </p>
                <p>
                  <span>V1</span>
                  <strong>初始上传</strong>
                  <small>保留原始文件哈希</small>
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function EvidenceAlert({
  icon,
  value,
  label,
  tone = "",
  onClick,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button className={tone} type="button" onClick={onClick}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
      <ChevronRight size={13} />
    </button>
  );
}
