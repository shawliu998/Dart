"use client";

import { useState } from "react";
import Link from "next/link";
import { zipSync, strToU8 } from "fflate";
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
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
}: {
  projectId: string;
  initialTree: PackageNode[];
  initialChecks: PackageCheck[];
  source: DataSource;
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
  const selected = checks.find((item) => item.id === selectedId) ?? checks[0];
  const failed = checks.filter((item) => item.status === "failed");
  const warnings = checks.filter(
    (item) => item.status === "warning" && !item.humanConfirmed,
  );

  async function validate() {
    setValidating(true);
    const result = await phaseApi.validatePackage(projectId);
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
  if (!selected) return null;
  return (
    <div className="page package-page">
      <header className="page-header">
        <div className="page-title-group">
          <h1>文件封装中心</h1>
          <p>
            按最终目录组织材料，执行确定性检查，并在人工确认警告后生成 ZIP
            与哈希清单。
          </p>
        </div>
        <div className="header-actions">
          <span className={`data-source ${source}`}>
            {source === "api" ? "API 数据" : "本地演示数据"}
          </span>
          <button className="button" type="button" onClick={downloadManifest}>
            <Hash size={14} />
            下载哈希清单
          </button>
          <button className="button" type="button" onClick={downloadPreview}>
            <Download size={14} />
            生成预览包
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
      <section className="package-summary">
        <article className="failed">
          <AlertOctagon size={16} />
          <span>
            <strong>{failed.length}</strong>
            <small>阻塞问题</small>
          </span>
        </article>
        <article className="warning">
          <AlertTriangle size={16} />
          <span>
            <strong>{warnings.length}</strong>
            <small>待确认警告</small>
          </span>
        </article>
        <article className="passed">
          <CheckCircle2 size={16} />
          <span>
            <strong>
              {checks.filter((item) => item.status === "passed").length}
            </strong>
            <small>检查通过</small>
          </span>
        </article>
        <div>
          <span>封装完成度</span>
          <strong>
            {Math.round(
              (checks.filter(
                (item) => item.status === "passed" || item.humanConfirmed,
              ).length /
                checks.length) *
                100,
            )}
            %
          </strong>
          <div>
            <i
              style={{
                width: `${Math.round((checks.filter((item) => item.status === "passed" || item.humanConfirmed).length / checks.length) * 100)}%`,
              }}
            />
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
            {validating ? "检查中" : "运行封装检查"}
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
      <div className="package-layout">
        <section className="panel package-tree">
          <div className="panel-header">
            <div>
              <h2>最终文件树</h2>
              <p>
                {flatten(tree).filter((item) => item.type === "file").length}{" "}
                个文件 · 8 个章节
              </p>
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
        <section className="panel validation-list">
          <div className="panel-header">
            <div>
              <h2>封装检查清单</h2>
              <p>文件存在、版本、签章、主体、修订、加密与重复项</p>
            </div>
            <span>{checks.length} 项规则</span>
          </div>
          <div className="validation-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>检查项</th>
                  <th>分类</th>
                  <th>文件</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check) => (
                  <tr
                    key={check.id}
                    className={check.id === selected.id ? "selected" : ""}
                    onClick={() => setSelectedId(check.id)}
                  >
                    <td>
                      <span className={`check-icon ${check.status}`}>
                        {check.status === "passed" ? (
                          <Check size={11} />
                        ) : check.status === "warning" ? (
                          <AlertTriangle size={11} />
                        ) : (
                          <X size={11} />
                        )}
                      </span>
                      <span>
                        <strong>{check.label}</strong>
                        <small>{check.message}</small>
                      </span>
                    </td>
                    <td>{check.category}</td>
                    <td>{check.file}</td>
                    <td>
                      <span className={`check-result ${check.status}`}>
                        {check.status === "passed"
                          ? "通过"
                          : check.status === "warning"
                            ? check.humanConfirmed
                              ? "已确认"
                              : "警告"
                            : "失败"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="panel package-detail">
          <header>
            <span className={`check-icon large ${selected.status}`}>
              {selected.status === "passed" ? (
                <Check size={16} />
              ) : selected.status === "warning" ? (
                <AlertTriangle size={16} />
              ) : (
                <X size={16} />
              )}
            </span>
            <div>
              <strong>{selected.label}</strong>
              <small>
                {selected.category} · {selected.file}
              </small>
            </div>
          </header>
          <section className={`validation-result-card ${selected.status}`}>
            <h3>校验结果</h3>
            <p>{selected.message}</p>
          </section>
          <section>
            <h3>修复建议</h3>
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
          {selected.status === "warning" && !selected.humanConfirmed && (
            <button
              className="button full-width"
              type="button"
              onClick={confirmWarning}
            >
              <Check size={13} />
              人工确认该警告
            </button>
          )}
          {selected.humanConfirmed && (
            <p className="human-confirmed">
              <FileCheck2 size={13} />
              已由人工确认，仍保留原始警告记录。
            </p>
          )}
        </aside>
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
