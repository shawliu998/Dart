"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { zipSync, strToU8 } from "fflate";
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  File,
  FileArchive,
  FileCheck2,
  FileText,
  Folder,
  FolderOpen,
  Hash,
  LoaderCircle,
  PackageCheck as PackageIcon,
  Play,
  Upload,
  X,
} from "lucide-react";
import { phaseApi } from "@/lib/api/phase2";
import { DataUnavailableState } from "@/components/feedback/data-unavailable-state";
import { projectApi } from "@/lib/api/projects";
import {
  MutationFeedback,
  type MutationResult,
} from "@/components/feedback/mutation-feedback";
import type {
  DataSource,
  PackageCheck,
  PackageNode,
} from "@/lib/phase-data/types";

export function PackageCenter({
  projectId,
  initialTree,
  initialChecks,
  source,
  loadError,
}: {
  projectId: string;
  initialTree: PackageNode[];
  initialChecks: PackageCheck[];
  source: DataSource;
  loadError?: string;
}) {
  const [tree, setTree] = useState(initialTree);
  const [checks, setChecks] = useState(initialChecks);
  const [expanded, setExpanded] = useState(
    () => new Set(initialTree.map((item) => item.id)),
  );
  const [selectedId, setSelectedId] = useState(
    initialChecks.find((item) => item.status === "failed")?.id ??
      initialChecks[0]?.id,
  );
  const [feedback, setFeedback] = useState<MutationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [approvalReason, setApprovalReason] = useState("");
  const [warningsAccepted, setWarningsAccepted] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<
    "all" | "attention" | "passed"
  >("all");
  const [mobilePane, setMobilePane] = useState<"checks" | "files">("checks");
  const selected = checks.find((item) => item.id === selectedId) ?? checks[0];
  const failed = checks.filter((item) => item.status === "failed");
  const warnings = checks.filter(
    (item) => item.status === "warning" && !item.humanConfirmed,
  );
  const passedCount = checks.filter((item) => item.status === "passed").length;
  const rulePassRate = checks.length
    ? Math.round((passedCount / checks.length) * 100)
    : 0;
  const files = flatten(tree).filter((item) => item.type === "file");
  const visibleChecks = checks.filter((item) => {
    if (reviewFilter === "passed") return item.status === "passed";
    if (reviewFilter === "attention") {
      return (
        item.status === "failed" ||
        (item.status === "warning" && !item.humanConfirmed)
      );
    }
    return true;
  });

  function changeReviewFilter(filter: "all" | "attention" | "passed") {
    setReviewFilter(filter);
    const firstVisible = checks.find((item) => {
      if (filter === "passed") return item.status === "passed";
      if (filter === "attention") {
        return (
          item.status === "failed" ||
          (item.status === "warning" && !item.humanConfirmed)
        );
      }
      return true;
    });
    if (firstVisible) setSelectedId(firstVisible.id);
  }

  async function validate() {
    setValidating(true);
    const result = await phaseApi.validatePackage(projectId);
    if (!result.failed) {
      const refreshed = await phaseApi.package(projectId);
      if (refreshed.error) {
        setValidating(false);
        setFeedback(
          failure(
            source,
            "封装检查结果刷新失败",
            `${refreshed.error}；页面保留检查前状态，请重试。`,
          ),
        );
        return;
      }
      setTree(refreshed.data.tree);
      setChecks(refreshed.data.checks);
      setSelectedId(
        refreshed.data.checks.find((item) => item.status === "failed")?.id ??
          refreshed.data.checks[0]?.id,
      );
    }
    setValidating(false);
    setFeedback(toFeedback(result, source, "封装检查已完成"));
  }
  async function repairWithFile(check: PackageCheck, files: FileList | null) {
    if (!files?.length) return;
    if (source === "api") {
      if (!check.packageItemId) {
        setFeedback(
          failure(
            "api",
            "无法绑定修复文件",
            "该校验结果缺少 package_item_id。",
          ),
        );
        return;
      }
      try {
        const document = await projectApi.uploadDocument(
          projectId,
          files[0],
          "bid_response",
        );
        const bound = await phaseApi.bindPackageItem(
          check.packageItemId,
          document.id,
        );
        if (bound.failed) {
          setFeedback(toFeedback(bound, source, "修复文件绑定失败"));
          return;
        }
        const validated = await phaseApi.validatePackage(projectId);
        if (validated.failed) {
          setFeedback(toFeedback(validated, source, "重新校验失败"));
          return;
        }
        const refreshed = await phaseApi.package(projectId);
        setTree(refreshed.data.tree);
        setChecks(refreshed.data.checks);
        setFeedback({
          source: "api",
          persisted: true,
          status: "success",
          title: "修复文件已绑定",
          message: "文件已上传、绑定，并重新运行封装检查。",
        });
        return;
      } catch (error) {
        setFeedback(
          failure(
            "api",
            "修复文件处理失败",
            `未更新状态：${error instanceof Error ? error.message : "未知错误"}`,
          ),
        );
        return;
      }
    }
    setChecks((current) =>
      current.map((item) =>
        item.id === check.id
          ? {
              ...item,
              status: "passed",
              message: `已选择修复文件：${files[0].name}`,
              suggestion: "将在下一次后端封装检查中重新验证",
            }
          : item,
      ),
    );
    setFeedback({
      source: "demo",
      persisted: false,
      status: "warning",
      title: "本地修复文件已选择",
      message: `${files[0].name} 用于修复“${check.label}”；正式状态以重新运行后端检查为准。`,
    });
  }
  function confirmWarning() {
    setChecks((current) =>
      current.map((item) =>
        item.id === selected.id ? { ...item, humanConfirmed: true } : item,
      ),
    );
    setFeedback({
      source: "demo",
      persisted: false,
      status: "warning",
      title: "警告已在演示中确认",
      message: "确认状态未写入后端；最终生成仍需填写审批原因。",
    });
  }
  async function downloadManifest() {
    if (source === "api") {
      const preview = await phaseApi.previewPackage(projectId);
      if (preview.failed) {
        setFeedback(toFeedback(preview, source, "哈希清单生成失败"));
        return;
      }
      try {
        downloadBlob(
          await phaseApi.downloadPackage(preview.data.package_id),
          "预览包_含MANIFEST_SHA256SUMS.zip",
        );
      } catch (error) {
        setFeedback(
          failure(
            "api",
            "下载失败",
            error instanceof Error ? error.message : "未知错误",
          ),
        );
      }
      return;
    }
    const manifest = {
      package: "智慧园区综合管理平台采购项目_投标文件_V4",
      generated_at: new Date().toISOString(),
      files: flatten(tree)
        .filter((item) => item.type === "file")
        .map((item) => ({
          path: item.name,
          size: item.size,
          version: item.version,
          sha256: demoHash(item.id),
        })),
      checks: checks.map((item) => ({
        rule: item.label,
        status: item.status,
        confirmed: item.humanConfirmed,
      })),
    };
    downloadBlob(
      new Blob([JSON.stringify(manifest, null, 2)], {
        type: "application/json",
      }),
      "manifest.json",
    );
    setFeedback({
      source: "demo",
      persisted: false,
      status: "warning",
      title: "演示清单已下载",
      message: "哈希由确定性演示生成，未写入后端。",
    });
  }
  async function downloadPreview() {
    if (source === "api") {
      const preview = await phaseApi.previewPackage(projectId);
      setFeedback(toFeedback(preview, source, "预览包已生成"));
      if (preview.failed) return;
      try {
        downloadBlob(
          await phaseApi.downloadPackage(preview.data.package_id),
          "投标材料_后端预览包.zip",
        );
      } catch (error) {
        setFeedback(
          failure(
            "api",
            "下载失败",
            error instanceof Error ? error.message : "未知错误",
          ),
        );
      }
      return;
    }
    const zip = buildZip(tree, checks, true);
    downloadBlob(
      new Blob([Uint8Array.from(zip)], { type: "application/zip" }),
      "投标材料_预览包.zip",
    );
    setFeedback({
      source: "demo",
      persisted: false,
      status: "warning",
      title: "本地预览 ZIP 已生成",
      message: "包含当前文件树说明和校验报告；未写入后端。",
    });
  }
  async function buildFinal() {
    if (failed.length || !warningsAccepted || !approvalReason.trim()) return;
    const result = await phaseApi.buildPackage(projectId, true, approvalReason);
    setFeedback(toFeedback(result, source, "最终包生成结果"));
    if (result.failed) return;
    if (source === "api") {
      try {
        downloadBlob(
          await phaseApi.downloadPackage(result.data.package_id),
          "智慧园区综合管理平台采购项目_后端最终包.zip",
        );
      } catch (error) {
        setFeedback(
          failure(
            "api",
            "最终包下载失败",
            error instanceof Error ? error.message : "未知错误",
          ),
        );
        return;
      }
    } else {
      const zip = buildZip(tree, checks, false);
      downloadBlob(
        new Blob([Uint8Array.from(zip)], { type: "application/zip" }),
        "智慧园区综合管理平台采购项目_投标文件_V4.zip",
      );
    }
    setBuildOpen(false);
  }
  if (loadError) {
    return (
      <DataUnavailableState
        title="文件封装 API 数据不可用"
        message={loadError}
      />
    );
  }
  if (!selected) return null;
  return (
    <div className="page package-page">
      <header className="page-header package-page-header">
        <div className="page-title-group">
          <h1>交付包检查</h1>
          <p>核对最终文件，处理阻塞项，并在人工批准后生成交付 ZIP。</p>
        </div>
        <div className="header-actions package-delivery-actions">
          <button className="button" type="button" onClick={downloadPreview}>
            <Download size={14} />
            预览交付包
          </button>
          <button
            className="button primary"
            type="button"
            onClick={() => setBuildOpen(true)}
          >
            <FileArchive size={14} />
            生成最终 ZIP
          </button>
        </div>
      </header>
      <section className="package-review-status" aria-label="交付包检查状态">
        <div className="package-status-copy">
          <strong className={failed.length ? "has-blockers" : "is-ready"}>
            {failed.length
              ? `${failed.length} 个问题阻止生成最终包`
              : "当前没有阻塞问题"}
          </strong>
          <span>
            {warnings.length} 个待确认 · {passedCount} 项通过 · 规则通过率{" "}
            {rulePassRate}%
          </span>
        </div>
        <div className="package-status-meta">
          <span className={`data-source ${source}`}>
            {source === "api" ? "已连接项目数据" : "演示项目数据"}
          </span>
          <span>
            {files.length} 个文件 · {tree.length} 个封装项
          </span>
          <button
            className="package-manifest-action"
            type="button"
            onClick={downloadManifest}
          >
            <Hash size={13} />
            导出校验清单
          </button>
        </div>
      </section>
      <MutationFeedback
        result={feedback}
        operation={
          validating
            ? {
                status: "loading",
                title: "正在运行封装检查",
                message:
                  "确定性规则正在检查文件存在性、版本、签章、主体和重复项。",
              }
            : { status: "idle" }
        }
      />
      <div className="package-mobile-switch" aria-label="移动端交付包视图">
        <button
          type="button"
          className={mobilePane === "checks" ? "active" : ""}
          aria-pressed={mobilePane === "checks"}
          onClick={() => setMobilePane("checks")}
        >
          检查与处理
          <span>{failed.length + warnings.length}</span>
        </button>
        <button
          type="button"
          className={mobilePane === "files" ? "active" : ""}
          aria-pressed={mobilePane === "files"}
          onClick={() => setMobilePane("files")}
        >
          交付文件
          <span>{files.length}</span>
        </button>
      </div>
      <div className="package-review-layout">
        <section
          className={`panel package-tree package-mobile-pane ${
            mobilePane === "files" ? "is-active" : ""
          }`}
        >
          <div className="panel-header">
            <div>
              <h2>交付文件</h2>
              <p>按最终目录核对 {files.length} 个文件</p>
            </div>
          </div>
          <div>
            {tree.map((node) => (
              <article key={node.id}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      return next;
                    })
                  }
                >
                  {expanded.has(node.id) ? (
                    <ChevronDown size={12} />
                  ) : (
                    <span className="tree-chevron">›</span>
                  )}
                  {expanded.has(node.id) ? (
                    <FolderOpen size={15} />
                  ) : (
                    <Folder size={15} />
                  )}
                  <strong>{node.name}</strong>
                  <span className={`tree-status ${node.status}`}>
                    {node.status === "valid"
                      ? "完整"
                      : node.status === "missing"
                        ? "缺件"
                        : "警告"}
                  </span>
                </button>
                {expanded.has(node.id) && (
                  <div className="tree-children">
                    {node.children?.map((child) => (
                      <Link
                        key={child.id}
                        href={`/evidence?from=package&file=${encodeURIComponent(child.name)}`}
                        title="在材料库查看来源文件"
                      >
                        <File size={13} />
                        <span>
                          <strong>{child.name}</strong>
                          <small>
                            {child.size} · {child.version}
                          </small>
                        </span>
                        <i className={`tree-dot ${child.status}`} />
                      </Link>
                    ))}
                    {!node.children?.length && (
                      <p className="missing-file">
                        <AlertOctagon size={13} />
                        未放置文件
                      </p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
        <section
          className={`panel validation-list package-mobile-pane ${
            mobilePane === "checks" ? "is-active" : ""
          }`}
        >
          <div className="panel-header package-review-header">
            <div>
              <h2>检查与处理</h2>
              <p>先处理阻塞项，再确认警告并预览交付包</p>
            </div>
            <button
              className="button small"
              type="button"
              onClick={validate}
              disabled={validating}
            >
              {validating ? (
                <LoaderCircle className="spin" size={12} />
              ) : (
                <Play size={12} />
              )}
              {validating ? "检查中" : "重新检查"}
            </button>
          </div>
          <div className="package-review-filters" aria-label="筛选检查项">
            <button
              type="button"
              className={reviewFilter === "all" ? "active" : ""}
              aria-pressed={reviewFilter === "all"}
              onClick={() => changeReviewFilter("all")}
            >
              全部 <span>{checks.length}</span>
            </button>
            <button
              type="button"
              className={reviewFilter === "attention" ? "active" : ""}
              aria-pressed={reviewFilter === "attention"}
              onClick={() => changeReviewFilter("attention")}
            >
              待处理 <span>{failed.length + warnings.length}</span>
            </button>
            <button
              type="button"
              className={reviewFilter === "passed" ? "active" : ""}
              aria-pressed={reviewFilter === "passed"}
              onClick={() => changeReviewFilter("passed")}
            >
              已通过 <span>{passedCount}</span>
            </button>
          </div>
          <div className="package-review-list">
            {visibleChecks.map((check) => {
              const isSelected = check.id === selected.id;
              return (
                <Fragment key={check.id}>
                  <button
                    type="button"
                    className={`package-review-row ${isSelected ? "selected" : ""}`}
                    aria-expanded={isSelected}
                    onClick={() => setSelectedId(check.id)}
                  >
                    <span className={`check-icon ${check.status}`}>
                      {check.status === "passed" ? (
                        <Check size={13} />
                      ) : check.status === "warning" ? (
                        <AlertTriangle size={13} />
                      ) : (
                        <X size={13} />
                      )}
                    </span>
                    <span className="package-review-primary">
                      <strong>{check.label}</strong>
                      <small>{check.message}</small>
                    </span>
                    <span className="package-review-file">
                      <small>{check.category}</small>
                      <strong>{check.file}</strong>
                    </span>
                    <span className={`check-result ${check.status}`}>
                      {check.status === "passed"
                        ? "通过"
                        : check.status === "warning"
                          ? check.humanConfirmed
                            ? "已确认"
                            : "待确认"
                          : "阻塞"}
                    </span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {isSelected && (
                    <div className="package-issue-panel">
                      <div className="package-issue-context">
                        <section
                          className={`validation-result-card ${selected.status}`}
                        >
                          <h3>检查结果</h3>
                          <p>{selected.message}</p>
                        </section>
                        <section>
                          <h3>处理建议</h3>
                          <p>{selected.suggestion}</p>
                        </section>
                        <section>
                          <h3>来源要求</h3>
                          <Link
                            href={`/projects/${projectId}/requirements?source=${encodeURIComponent(selected.sourceRequirement)}&package_check=${encodeURIComponent(selected.id)}`}
                          >
                            <FileText size={12} />
                            {selected.sourceRequirement}
                          </Link>
                        </section>
                      </div>
                      <div className="package-issue-action">
                        {selected.status === "failed" && (
                          <label className="button primary repair-upload">
                            <Upload size={13} />
                            上传修复文件
                            <input
                              className="sr-only"
                              type="file"
                              onChange={(event) =>
                                repairWithFile(selected, event.target.files)
                              }
                            />
                          </label>
                        )}
                        {selected.status === "warning" &&
                          !selected.humanConfirmed && (
                            <button
                              className="button"
                              type="button"
                              onClick={confirmWarning}
                            >
                              <Check size={13} />
                              人工确认警告
                            </button>
                          )}
                        {selected.humanConfirmed && (
                          <p className="human-confirmed">
                            <FileCheck2 size={13} />
                            已人工确认，原始警告仍保留
                          </p>
                        )}
                        {selected.status === "passed" && (
                          <p className="package-check-complete">
                            <Check size={13} />
                            无需处理
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
            {!visibleChecks.length && (
              <div className="package-review-empty">当前筛选下没有检查项。</div>
            )}
          </div>
          <footer className="package-review-footer">
            <span>
              {failed.length
                ? `处理完 ${failed.length} 个阻塞问题后才能生成最终包`
                : "阻塞项已清除，可预览并进入人工批准"}
            </span>
            <button
              className="button small"
              type="button"
              onClick={downloadPreview}
            >
              <Download size={13} />
              预览交付包
            </button>
          </footer>
        </section>
      </div>
      {buildOpen && (
        <div className="dialog-backdrop">
          <div
            className="dialog package-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="build-package-title"
          >
            <div className="dialog-title">
              <div>
                <h2 id="build-package-title">生成最终投标 ZIP</h2>
                <p>最终包生成是人工批准操作，不代表已提交到外部平台。</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setBuildOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
            {failed.length > 0 && (
              <div className="blocking-list">
                <strong>
                  <AlertOctagon size={14} />
                  仍有 {failed.length} 个阻塞问题
                </strong>
                {failed.map((item) => (
                  <p key={item.id}>
                    {item.label} · {item.file}
                  </p>
                ))}
                <small>请关闭窗口，选择问题并上传修复文件后重试。</small>
              </div>
            )}
            {failed.length === 0 && (
              <>
                <div className="warning-list">
                  <strong>
                    <AlertTriangle size={14} />
                    仍有 {warnings.length} 个未确认警告
                  </strong>
                  {warnings.map((item) => (
                    <p key={item.id}>
                      {item.label} · {item.file}
                    </p>
                  ))}
                </div>
                <label className="confirmation-check">
                  <input
                    type="checkbox"
                    checked={warningsAccepted}
                    onChange={(event) =>
                      setWarningsAccepted(event.target.checked)
                    }
                  />
                  <span>我已查看以上警告并批准生成最终包</span>
                </label>
                <label className="form-field">
                  <span>
                    审批原因 <em>必填</em>
                  </span>
                  <textarea
                    rows={3}
                    value={approvalReason}
                    onChange={(event) => setApprovalReason(event.target.value)}
                    placeholder="说明警告接受依据和审批范围。"
                  />
                </label>
              </>
            )}
            <div className="dialog-actions">
              <button
                className="button"
                type="button"
                onClick={() => setBuildOpen(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="button"
                disabled={
                  failed.length > 0 ||
                  !warningsAccepted ||
                  !approvalReason.trim()
                }
                onClick={buildFinal}
              >
                <PackageIcon size={13} />
                批准并生成 ZIP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function flatten(nodes: PackageNode[]): PackageNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
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
function failure(
  source: DataSource,
  title: string,
  message: string,
): MutationResult {
  return { source, persisted: false, status: "error", title, message };
}
function demoHash(seed: string) {
  return Array.from({ length: 4 }, (_, index) =>
    btoa(`${seed}-${index}`).replaceAll("=", "").slice(0, 16),
  )
    .join("")
    .toLowerCase();
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
function buildZip(
  tree: PackageNode[],
  checks: PackageCheck[],
  preview: boolean,
) {
  const files: Record<string, Uint8Array> = {
    "README.txt": strToU8(
      `${preview ? "预览" : "最终"}投标材料包\n本地演示生成；不代表已提交。`,
    ),
    "manifest.json": strToU8(
      JSON.stringify(
        {
          files: flatten(tree)
            .filter((item) => item.type === "file")
            .map((item) => item.name),
          checks,
        },
        null,
        2,
      ),
    ),
  };
  flatten(tree)
    .filter((item) => item.type === "file")
    .forEach((item) => {
      files[`投标文件/${item.name}.txt`] = strToU8(
        `演示文件占位记录\n名称：${item.name}\n版本：${item.version}\n状态：${item.status}`,
      );
    });
  return zipSync(files, { level: 6 });
}
