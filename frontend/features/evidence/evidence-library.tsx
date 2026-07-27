"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSearch,
  FileText,
  Search,
} from "lucide-react";
import { ConfidenceIndicator } from "@/components/ui/badges";
import { DocumentViewer } from "@/components/documents/document-viewer";
import type { DataSource, EvidenceAsset } from "@/lib/phase-data/types";
import styles from "./evidence-library-v2.module.css";

const statusLabel: Record<EvidenceAsset["status"], string> = {
  verified: "已人工验证",
  review: "待人工验证",
  expired: "已过期",
  conflict: "存在冲突",
};

type DetailTab = "preview" | "claims" | "usage" | "history";

const detailTabs: Array<[DetailTab, string]> = [
  ["claims", "Claims"],
  ["preview", "来源预览"],
  ["usage", "使用项目"],
  ["history", "版本"],
];

function reuseGuidance(asset: EvidenceAsset) {
  if (asset.status === "expired") {
    return {
      tone: "danger",
      title: "已过期，不应直接复用",
      detail: `有效期为 ${asset.validUntil}，请先确认是否已有更新材料。`,
    };
  }
  if (asset.status === "conflict") {
    return {
      tone: "danger",
      title: "存在冲突，需要先复核",
      detail: "结构化 Claim 中存在与当前投标条件不一致的信息。",
    };
  }
  if (asset.status === "review") {
    return {
      tone: "review",
      title: "尚未完成人工验证",
      detail: "可查看来源与使用记录，但不能仅凭当前状态判断可复用。",
    };
  }
  return {
    tone: "ready",
    title: "信息已验证，可作为候选材料",
    detail: "请继续结合当前招标要求核对适用范围与有效期。",
  };
}

function expiryCopy(asset: EvidenceAsset) {
  if (asset.expiryDays < 0) {
    return `已过期 ${Math.abs(asset.expiryDays)} 天`;
  }
  if (asset.expiryDays <= 90) {
    return `${asset.expiryDays} 天后到期`;
  }
  return "当前有效";
}

export function EvidenceLibrary({
  initialAssets,
  source,
  error,
}: {
  initialAssets: EvidenceAsset[];
  source: DataSource;
  error?: string;
}) {
  const assets = initialAssets;
  const [selectedId, setSelectedId] = useState(initialAssets[0]?.id);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [tab, setTab] = useState<DetailTab>("claims");
  const [previewPage, setPreviewPage] = useState(1);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const filtered = useMemo(
    () =>
      assets.filter(
        (item) =>
          `${item.name}${item.tags.join("")}${item.legalEntity}${item.owner}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()) &&
          (type === "all" || item.type === type) &&
          (status === "all" || item.status === status),
      ),
    [assets, query, status, type],
  );
  const selected =
    filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const types = Array.from(new Set(assets.map((item) => item.type)));
  const reviewCount = assets.filter((item) => item.status === "review").length;
  const riskCount = assets.filter(
    (item) => item.status === "expired" || item.status === "conflict",
  ).length;
  const activeFilterCount =
    Number(Boolean(query.trim())) +
    Number(type !== "all") +
    Number(status !== "all");

  function selectAsset(asset: EvidenceAsset) {
    setSelectedId(asset.id);
    setTab("claims");
    setPreviewPage(1);
    setMobileView("detail");
  }

  function clearFilters() {
    setQuery("");
    setType("all");
    setStatus("all");
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
            <p>集中查看材料状态、有效期、Claims 与项目使用记录。</p>
          </div>
          <span className="data-source api">API 数据不可用</span>
        </header>
        <section className="panel empty-state" role="alert" aria-live="assertive">
          <AlertTriangle size={20} aria-hidden="true" />
          <strong>企业材料数据暂时不可用</strong>
          <p>未能读取企业材料，当前页面不会显示替代数据。</p>
          <button
            className="button"
            type="button"
            onClick={() => window.location.reload()}
          >
            重试读取
          </button>
        </section>
      </div>
    );
  }

  if (!assets.length) {
    return (
      <div className="page evidence-page">
        <header className="page-header">
          <div className="page-title-group">
            <h1>企业材料库</h1>
            <p>集中查看材料状态、有效期、Claims 与项目使用记录。</p>
          </div>
        </header>
        <section className="panel empty-state">
          <FileSearch size={20} aria-hidden="true" />
          <strong>当前没有可复核的企业材料</strong>
          <p>材料进入现有数据源后，将在这里显示状态、来源和使用记录。</p>
        </section>
      </div>
    );
  }

  return (
    <div className={`page evidence-page ${styles.page}`}>
      <header className={`page-header ${styles.pageHeader}`}>
        <div className="page-title-group">
          <h1>企业材料库</h1>
          <p>集中复核材料的有效性、来源与项目使用记录。</p>
        </div>
        <button className="button" type="button" onClick={exportInventory}>
          <Download size={14} aria-hidden="true" />
          导出当前清单
        </button>
      </header>

      <section className={styles.toolbar} aria-label="材料筛选">
        <label className={styles.search}>
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">搜索企业材料</span>
          <input
            aria-label="搜索企业材料"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件、标签、主体或负责人"
          />
        </label>
        <label className={styles.select}>
          <span>类型</span>
          <select
            aria-label="材料类型筛选"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">全部类型</option>
            {types.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.select}>
          <span>状态</span>
          <select
            aria-label="材料状态筛选"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">全部状态</option>
            {Object.entries(statusLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.summary} aria-label="材料复核概况">
          <span>
            <strong>{filtered.length}</strong> 份材料
          </span>
          <i />
          <span>{reviewCount} 份待验证</span>
          <span className={riskCount ? styles.risk : ""}>
            {riskCount} 份有风险
          </span>
        </div>
        {activeFilterCount > 0 && (
          <button
            className={styles.clear}
            type="button"
            onClick={clearFilters}
          >
            清除 {activeFilterCount} 项筛选
          </button>
        )}
      </section>

      <div className={styles.mobileSwitcher} aria-label="移动端材料视图">
        <button
          type="button"
          aria-pressed={mobileView === "list"}
          onClick={() => setMobileView("list")}
        >
          材料列表
        </button>
        <button
          type="button"
          aria-pressed={mobileView === "detail"}
          disabled={!selected}
          onClick={() => setMobileView("detail")}
        >
          材料详情
        </button>
      </div>

      <div
        className={`${styles.workspace} ${
          mobileView === "detail" ? styles.showDetail : styles.showList
        }`}
      >
        <section className={`panel ${styles.listPanel}`} aria-label="材料清单">
          <header className={styles.listHeader}>
            <div>
              <h2>材料清单</h2>
              <p>选择一份材料，核对是否适合当前投标使用。</p>
            </div>
            <span>{filtered.reduce((sum, item) => sum + item.claimCount, 0)} 个 Claims</span>
          </header>
          {filtered.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>材料</th>
                    <th>主体 / 部门</th>
                    <th>有效期</th>
                    <th>验证状态</th>
                    <th>使用 / Claims</th>
                    <th>最近复核</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((asset) => (
                    <tr
                      key={asset.id}
                      className={asset.id === selected?.id ? styles.selected : ""}
                      onClick={() => selectAsset(asset)}
                    >
                      <td>
                        <button
                          className={styles.assetButton}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectAsset(asset);
                          }}
                        >
                          <strong>{asset.name}</strong>
                          <small>
                            {asset.type} · {asset.version} · {asset.size}
                          </small>
                        </button>
                      </td>
                      <td>
                        <strong title={asset.legalEntity}>{asset.legalEntity}</strong>
                        <small>{asset.department}</small>
                      </td>
                      <td>
                        <strong>{asset.validUntil}</strong>
                        <small className={asset.expiryDays < 0 ? styles.dangerText : ""}>
                          {expiryCopy(asset)}
                        </small>
                      </td>
                      <td>
                        <span className={`${styles.status} ${styles[asset.status]}`}>
                          {statusLabel[asset.status]}
                        </span>
                      </td>
                      <td>
                        <strong>{asset.usageCount} 个项目</strong>
                        <small>{asset.claimCount} 个 Claims</small>
                      </td>
                      <td>
                        <strong>{asset.lastReviewed}</strong>
                        <small>{asset.owner}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.noResults}>
              <FileSearch size={20} aria-hidden="true" />
              <strong>没有匹配的企业材料</strong>
              <p>调整搜索词或清除筛选后重试。</p>
              <button type="button" onClick={clearFilters}>
                清除筛选
              </button>
            </div>
          )}
        </section>

        <aside className={`panel ${styles.detailPanel}`} aria-label="材料复核详情">
          {selected ? (
            <>
              <header className={styles.detailHeader}>
                <span className={styles.fileIcon}>
                  <FileText size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>{selected.name}</strong>
                  <small>
                    {selected.type} · {selected.version} · {selected.pageCount} 页
                  </small>
                </div>
                <span className={`${styles.status} ${styles[selected.status]}`}>
                  {statusLabel[selected.status]}
                </span>
              </header>

              <ReviewSummary asset={selected} />

              <dl className={styles.facts}>
                <div>
                  <dt>主体</dt>
                  <dd>{selected.legalEntity}</dd>
                </div>
                <div>
                  <dt>有效期</dt>
                  <dd>
                    {selected.validUntil}
                    <small>{expiryCopy(selected)}</small>
                  </dd>
                </div>
                <div>
                  <dt>最近复核</dt>
                  <dd>
                    {selected.lastReviewed}
                    <small>{selected.owner}</small>
                  </dd>
                </div>
                <div>
                  <dt>引用情况</dt>
                  <dd>
                    {selected.usageCount} 个项目
                    <small>{selected.claimCount} 个 Claims</small>
                  </dd>
                </div>
              </dl>

              <div className={styles.tabs} role="tablist" aria-label="材料详情">
                {detailTabs.map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? styles.activeTab : ""}
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

              <div className={styles.detailBody}>
                {tab === "claims" && (
                  <div className={styles.claims}>
                    <header>
                      <strong>{selected.claims.length} 个结构化 Claims</strong>
                      <small>保留来源页与置信度</small>
                    </header>
                    {selected.claims.map((claim) => (
                      <article
                        key={claim.id}
                        className={claim.conflict ? styles.claimConflict : ""}
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
                            第 {claim.page} 页
                            <ChevronRight size={12} aria-hidden="true" />
                          </button>
                          <ConfidenceIndicator value={claim.confidence} />
                        </footer>
                        {claim.conflict && (
                          <aside>
                            <AlertTriangle size={13} aria-hidden="true" />
                            {claim.conflict}
                          </aside>
                        )}
                      </article>
                    ))}
                    {!selected.claims.length && (
                      <div className={styles.inlineEmpty}>
                        <strong>尚无结构化 Claim</strong>
                        <span>当前材料没有可用于判断的 Claim 数据。</span>
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
                  <div className={styles.records}>
                    <header>
                      <strong>已使用项目</strong>
                      <small>{selected.usedBy.length} 个可追溯引用</small>
                    </header>
                    {selected.usedBy.map((project) => (
                      <div key={project}>
                        <span>{project}</span>
                        <small>正在引用当前材料</small>
                      </div>
                    ))}
                    {!selected.usedBy.length && (
                      <div className={styles.inlineEmpty}>
                        <strong>尚未被项目使用</strong>
                        <span>当前数据中没有项目引用记录。</span>
                      </div>
                    )}
                  </div>
                )}

                {tab === "history" && (
                  <div className={styles.records}>
                    <header>
                      <strong>当前版本</strong>
                      <small>现有接口只返回最新版本</small>
                    </header>
                    <div>
                      <span>{selected.version}</span>
                      <strong>{selected.lastReviewed} · {selected.owner} 复核</strong>
                      <small>{selected.size} · {selected.pageCount} 页</small>
                    </div>
                    <p className={styles.historyNote}>
                      当前数据未提供历史快照，因此不展示无法核实的版本比较。
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.noSelection}>
              <FileSearch size={20} aria-hidden="true" />
              <strong>请选择一份材料</strong>
              <p>从材料清单中选择条目后查看复核信息。</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ReviewSummary({ asset }: { asset: EvidenceAsset }) {
  const guidance = reuseGuidance(asset);
  const Icon = guidance.tone === "ready" ? CheckCircle2 : AlertTriangle;

  return (
    <section
      className={`${styles.reviewSummary} ${styles[guidance.tone]}`}
      aria-label="材料复用提示"
    >
      <Icon size={17} aria-hidden="true" />
      <div>
        <strong>{guidance.title}</strong>
        <p>{guidance.detail}</p>
      </div>
    </section>
  );
}
