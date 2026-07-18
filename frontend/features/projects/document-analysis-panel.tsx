"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { projectApi, type ProjectDocument } from "@/lib/api/projects";

const statusLabel: Record<string, string> = {
  completed: "分析完成",
  parsing: "正在解析",
  pending: "等待分析",
  failed: "分析失败",
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function DocumentAnalysisPanel({ projectId, initialDocuments }: { projectId: string; initialDocuments: ProjectDocument[] }) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runningProgress, setRunningProgress] = useState(0);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function reanalyze(document: ProjectDocument) {
    setRunningId(document.id);
    setRunningProgress(0);
    setFeedback(null);
    try {
      const started = await projectApi.reanalyzeDocument(document.id);
      if (!started.job_id) throw new Error("未返回任务编号");
      let status = started.status ?? "queued";
      for (let attempt = 0; attempt < 90 && !["completed", "failed", "cancelled"].includes(status); attempt += 1) {
        await wait(1000);
        const job = await projectApi.job(started.job_id);
        status = job.status;
        setRunningProgress(job.progress ?? 0);
      }
      if (status !== "completed") throw new Error(status === "cancelled" ? "分析任务已取消" : "分析未完成，请稍后重试");
      setDocuments(await projectApi.documents(projectId));
      setFeedback({ tone: "success", text: `${document.filename} 已完成新版本分析，历史版本仍可追溯。` });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error && error.message === "API_409"
        ? "该文档已有分析任务正在运行。"
        : error instanceof Error ? error.message : "重新分析失败";
      setFeedback({ tone: "error", text: message });
    } finally {
      setRunningId(null);
      setRunningProgress(0);
    }
  }

  return <section className="panel document-analysis-panel" aria-label="文档分析版本">
    <div className="panel-header"><div><h2>文档分析版本</h2><p>重新分析仅在完整成功后切换当前版本，失败不会影响现有结果</p></div><span>{documents.length} 份文档</span></div>
    {feedback && <div className={`mutation-feedback ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</div>}
    {documents.length === 0 ? <p className="document-analysis-empty">当前项目还没有上传文档。</p> : <div className="document-analysis-list">
      {documents.map((document) => {
        const running = runningId === document.id;
        return <article key={document.id}>
          <span className="file-icon"><FileText size={17} /></span>
          <span><strong>{document.filename}</strong><small>{statusLabel[document.parseStatus] ?? document.parseStatus} · {document.pageCount} 页 · 分析版本 V{document.parseRevision}</small></span>
          <button className="button" type="button" disabled={runningId !== null || document.parseStatus === "parsing"} onClick={() => void reanalyze(document)}>{running ? <><LoaderCircle className="spin" size={14} />正在分析 {runningProgress}%</> : <><RefreshCw size={14} />重新分析</>}</button>
        </article>;
      })}
    </div>}
  </section>;
}
