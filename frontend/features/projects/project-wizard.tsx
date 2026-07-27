"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, Plus, RotateCcw, X } from "lucide-react";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { agentApi } from "@/lib/api/agent";
import { isDemoMode } from "@/lib/api/client";
import { projectApi } from "@/lib/api/projects";

type DocumentType = "tender_main" | "tender_attachment" | "amendment" | "clarification";
type UploadStatus = "pending" | "uploading" | "uploaded" | "failed" | "retrying";
type UploadFile = {
  name: string;
  size: number;
  type: string;
  documentType: DocumentType;
  file: File;
  status: UploadStatus;
  error?: string;
};

const documentTypeOptions: Array<{ value: DocumentType; label: string }> = [
  { value: "tender_main", label: "招标主文件" },
  { value: "tender_attachment", label: "招标附件" },
  { value: "amendment", label: "更正 / 补遗" },
  { value: "clarification", label: "答疑 / 澄清" },
];

const uploadStatusLabels: Record<UploadStatus, string> = {
  pending: "待上传",
  uploading: "上传中",
  uploaded: "已上传",
  failed: "上传失败",
  retrying: "重试中",
};

export function ProjectWizard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [buyer, setBuyer] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | DocumentType>("all");
  const [starting, setStarting] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState("");
  const remoteMode = !isDemoMode;
  const canStart = Boolean(name.trim()) && files.length > 0;
  const uploadedCount = files.filter((file) => file.status === "uploaded").length;
  const failedCount = files.filter((file) => file.status === "failed").length;
  const allUploaded = files.length > 0 && uploadedCount === files.length;
  const primaryLabel = failedCount
    ? "重试失败文件"
    : allUploaded
      ? "继续要求提取"
      : createdProjectId
        ? "上传并继续"
        : "创建并开始分析";
  const visibleFiles = useMemo(
    () => typeFilter === "all" ? files : files.filter((file) => file.documentType === typeFilter),
    [files, typeFilter],
  );

  function addFiles(fileList: FileList | File[]) {
    setFiles((current) => {
      const incoming = Array.from(fileList)
        .filter((file) => !current.some((existing) => existing.name === file.name))
        .map((file, index) => ({
          name: file.name,
          size: file.size,
          type: file.name.split(".").pop()?.toUpperCase() ?? "FILE",
          documentType: current.length === 0 && index === 0 ? "tender_main" as const : "tender_attachment" as const,
          file,
          status: "pending" as const,
        }));
      return [...current, ...incoming];
    });
  }

  function updateFile(name: string, update: Partial<UploadFile>) {
    setFiles((current) => current.map((item) => item.name === name ? { ...item, ...update } : item));
  }

  async function uploadFile(projectId: string, target: UploadFile, retrying = false) {
    updateFile(target.name, { status: retrying ? "retrying" : "uploading", error: "" });
    try {
      await projectApi.uploadDocument(projectId, target.file, target.documentType);
      updateFile(target.name, { status: "uploaded", error: "" });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "文件上传失败，请重试。";
      updateFile(target.name, { status: "failed", error: message });
      return false;
    }
  }

  async function startAnalysis() {
    if (!canStart || starting) return;
    setWorkflowError("");
    setStarting(true);
    if (!remoteMode) {
      router.push(`/projects/${DEMO_PROJECT_ID}/overview`);
      setStarting(false);
      return;
    }
    try {
      let projectId = createdProjectId;
      if (!projectId) {
        const project = await projectApi.create({ name: name.trim(), projectCode: code.trim(), buyerName: buyer.trim() });
        projectId = project.id;
        setCreatedProjectId(project.id);
      }
      const retryingFailures = files.some((file) => file.status === "failed");
      const pendingFiles = retryingFailures
        ? files.filter((file) => file.status === "failed")
        : files.filter((file) => file.status !== "uploaded");
      const uploadResults = await Promise.all(
        pendingFiles.map((file) => uploadFile(projectId, file, file.status === "failed")),
      );
      if (uploadResults.some((uploaded) => !uploaded)) {
        setWorkflowError("部分文件上传失败。已成功的文件不会重复上传，请重试失败文件。");
        return;
      }
      if (retryingFailures) return;
      const result = await agentApi.createRun(projectId);
      if (!result.data || result.error) throw new Error(result.error?.message ?? "未能创建分析任务");
      router.push(`/projects/${encodeURIComponent(projectId)}/overview`);
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "创建项目或启动分析失败，请检查本地服务后重试。");
    } finally {
      setStarting(false);
    }
  }

  async function retrySingleFile(target: UploadFile) {
    if (!createdProjectId || starting || target.status !== "failed") return;
    setWorkflowError("");
    setStarting(true);
    const uploaded = await uploadFile(createdProjectId, target, true);
    if (!uploaded) setWorkflowError(`${target.name} 仍未上传成功，请检查文件或服务后重试。`);
    setStarting(false);
  }

  return (
    <div className="page wizard-page">
      <header className="page-header intake-page-header">
        <div className="page-title-group">
          <Link className="back-link" href="/projects"><ArrowLeft size={14} />返回项目</Link>
          <h1>新建投标项目</h1>
          <p>录入项目资料，整理招标文件包，然后启动要求提取。</p>
        </div>
        <div className="header-actions">
          <Link className="button" href="/projects">取消</Link>
          <button className="button primary" type="button" disabled={!canStart || starting} onClick={startAnalysis}>
            {starting ? <><LoaderCircle className="spin" size={14} />正在处理文件</> : primaryLabel}
          </button>
        </div>
      </header>

      <section className="intake-details" aria-labelledby="project-details-title">
        <header>
          <h2 id="project-details-title">项目基本信息</h2>
          <span>项目名称为必填项，其余信息可在文件解析后补充。</span>
        </header>
        <div className="intake-form-grid">
          <Field label="项目名称" required><input value={name} disabled={Boolean(createdProjectId) || starting} onChange={(event) => setName(event.target.value)} placeholder="输入项目名称" /></Field>
          <Field label="项目编号"><input value={code} disabled={Boolean(createdProjectId) || starting} onChange={(event) => setCode(event.target.value)} placeholder="可留空，系统将从文件提取" /></Field>
          <Field label="采购人"><input value={buyer} disabled={Boolean(createdProjectId) || starting} onChange={(event) => setBuyer(event.target.value)} placeholder="可留空，系统将从文件提取" /></Field>
        </div>
      </section>

      <section className="intake-package" aria-labelledby="solicitation-package-title">
        <header className="intake-package-header">
          <div>
            <h2 id="solicitation-package-title">招标文件包</h2>
            <span>
              {files.length
                ? `${uploadedCount}/${files.length} 份已上传${failedCount ? ` · ${failedCount} 份失败` : ""}`
                : "至少添加一份招标主文件"}
            </span>
          </div>
          <div className="intake-package-actions">
            <label>
              <span className="sr-only">按文档类型筛选</span>
              <select aria-label="按文档类型筛选" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | DocumentType)}>
                <option value="all">全部类型</option>
                {documentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="button">
              <input className="sr-only" type="file" multiple accept=".pdf,.docx,.xlsx" disabled={starting} onChange={(event) => event.target.files && addFiles(event.target.files)} />
              <Plus size={14} />添加文件
            </label>
          </div>
        </header>

        <div className="upload-table-wrap">
          <table className="upload-table intake-upload-table">
            <thead><tr><th>文件名</th><th>状态</th><th>文档用途</th><th>格式 / 大小</th><th><span className="sr-only">操作</span></th></tr></thead>
            <tbody>
              {visibleFiles.map((file) => (
                <tr key={file.name}>
                  <td title={file.name}>
                    <span className="intake-file-name">
                      <strong>{file.name}</strong>
                      {file.error && <small>{file.error}</small>}
                    </span>
                  </td>
                  <td>
                    <span className={`upload-status ${file.status}`} aria-live="polite">
                      {(file.status === "uploading" || file.status === "retrying") && <LoaderCircle className="spin" size={12} />}
                      {uploadStatusLabels[file.status]}
                    </span>
                  </td>
                  <td>
                    <select aria-label={`设置 ${file.name} 文档类型`} value={file.documentType} disabled={starting || file.status !== "pending"} onChange={(event) => setFiles((current) => current.map((item) => item.name === file.name ? { ...item, documentType: event.target.value as DocumentType } : item))}>
                      {documentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </td>
                  <td>{file.type} · {formatSize(file.size)}</td>
                  <td>
                    {file.status === "failed" && createdProjectId
                      ? <span className="intake-failed-actions">
                          <button className="intake-retry-button" type="button" disabled={starting} aria-label={`重试 ${file.name}`} onClick={() => retrySingleFile(file)}><RotateCcw size={12} />重试</button>
                          <button className="icon-button" type="button" disabled={starting} aria-label={`移除失败文件 ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item.name !== file.name))}><X size={13} /></button>
                        </span>
                      : file.status === "pending"
                        ? <button className="icon-button" type="button" disabled={starting} aria-label={`移除 ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item.name !== file.name))}><X size={14} /></button>
                        : <span className="intake-row-locked">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleFiles.length === 0 && <div className="intake-empty-state">{files.length ? "当前筛选条件下没有文件。" : "尚未添加文件。使用右上角“添加文件”选择完整招标包。"}</div>}
        <footer>
          <span>支持 PDF、DOCX、XLSX。第一份文件默认标记为招标主文件，可在表格中调整。</span>
          <span>{remoteMode ? "已上传文件不会重复提交；全部成功后才启动要求提取。" : "演示模式不会写入后端。"}</span>
        </footer>
      </section>

      {workflowError && <div className="workflow-status error" role="alert"><strong>{workflowError}</strong></div>}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="form-field"><span>{label}{required && <em>必填</em>}</span>{children}</label>;
}

function formatSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}
