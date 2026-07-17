"use client";

import { DragEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, FileText, LoaderCircle, UploadCloud, X } from "lucide-react";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { agentApi } from "@/lib/api/agent";
import { isDemoMode } from "@/lib/api/client";
import { projectApi } from "@/lib/api/projects";

const steps = ["项目信息", "上传招标文件", "确认并开始分析"];
type UploadFile = { name: string; size: number; type: string; file: File };

export function ProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [buyer, setBuyer] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [starting, setStarting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const remoteMode = !isDemoMode;
  const canContinue = step === 0 ? Boolean(name.trim()) : step === 1 ? files.length > 0 : true;
  const projectSummary = useMemo(() => `${name || "未填写项目名称"} · ${code || "未填写项目编号"}`, [code, name]);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).map((file) => ({ name: file.name, size: file.size, type: file.name.split(".").pop()?.toUpperCase() ?? "FILE", file }));
    setFiles((current) => [...current, ...incoming.filter((item) => !current.some((existing) => existing.name === item.name))]);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  async function startAnalysis() {
    setWorkflowError("");
    setStarting(true);
    if (!remoteMode) {
      setComplete(true);
      setStarting(false);
      return;
    }
    try {
      const project = await projectApi.create({ name: name.trim(), projectCode: code.trim(), buyerName: buyer.trim() });
      await Promise.all(files.map((file, index) => projectApi.uploadDocument(project.id, file.file, index === 0 ? "tender_main" : "tender_attachment")));
      const result = await agentApi.createRun(project.id);
      if (!result.data || result.error) throw new Error(result.error?.message ?? "未能创建分析任务");
      router.push(`/agent?project=${encodeURIComponent(project.id)}`);
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "创建项目或启动分析失败，请检查本地服务后重试。");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="page wizard-page">
      <header className="page-header">
        <div className="page-title-group"><Link className="back-link" href="/projects"><ArrowLeft size={14} />返回项目</Link><h1>新建投标项目</h1><p>创建项目并上传招标文件，Agent 会在工作台中持续分析和提示下一步。</p></div>
      </header>

      <ol className="wizard-steps" aria-label="创建项目步骤">{steps.map((label, index) => <li key={label} className={index === step ? "current" : index < step ? "done" : ""} aria-current={index === step ? "step" : undefined}><span>{index < step ? <Check size={13} /> : index + 1}</span><strong>{label}</strong></li>)}</ol>

      <section className="panel wizard-panel">
        <div className="wizard-heading"><span>步骤 {step + 1} / {steps.length}</span><h2>{steps[step]}</h2><p>{wizardDescription(step)}</p></div>
        <div className="wizard-body">
          {step === 0 && <div className="form-grid"><Field label="项目名称" required><input value={name} onChange={(event) => setName(event.target.value)} placeholder="输入项目名称" /></Field><Field label="项目编号"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="可留空，由 Agent 从文件提取" /></Field><Field label="采购人"><input value={buyer} onChange={(event) => setBuyer(event.target.value)} placeholder="可留空，由 Agent 从文件提取" /></Field></div>}
          {step === 1 && <UploadArea files={files} onFiles={addFiles} onDrop={drop} onRemove={(fileName) => setFiles((current) => current.filter((file) => file.name !== fileName))} />}
          {step === 2 && !complete && <div className="review-grid"><Review label="项目" value={projectSummary} /><Review label="采购人" value={buyer || "未填写"} /><Review label="招标文件" value={`${files.length} 个待上传文件`} /><Review label="启动方式" value={remoteMode ? "创建项目并上传后，启动 Agent 分析" : "本地确定性演示，不写入后端"} /><div className="safety-note"><FileText size={18} /><span><strong>分析将在 Agent 工作台继续</strong><small>文件上传完成后，Agent 会依次解析、提取要求并在需要时请求人工复核。</small></span></div>{workflowError && <div className="workflow-status error" role="alert"><strong>{workflowError}</strong></div>}</div>}
          {step === 2 && complete && <div className="parse-complete"><span><Check size={28} /></span><h2>演示分析已准备完成</h2><p>本地演示不会写入后端；可打开 Agent 工作台查看确定性演示流程。</p><Link className="button primary" href={`/agent?project=${DEMO_PROJECT_ID}`}>打开 Agent 工作台<ArrowRight size={15} /></Link></div>}
        </div>
        {!complete && <footer className="wizard-footer"><button className="button" type="button" disabled={step === 0 || starting} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft size={14} />上一步</button><span>{remoteMode ? "项目和文件会在确认后写入本地服务" : "演示模式不会写入后端"}</span>{step < steps.length - 1 ? <button className="button primary" type="button" disabled={!canContinue || starting} onClick={() => setStep((value) => value + 1)}>下一步<ArrowRight size={14} /></button> : <button className="button primary" type="button" disabled={starting || !canContinue} onClick={startAnalysis}>{starting ? <><LoaderCircle className="spin" size={15} />正在启动分析</> : <><UploadCloud size={15} />确认并开始分析</>}</button>}</footer>}
      </section>
    </div>
  );
}

function wizardDescription(step: number) { return ["填写招标公告中的项目、编号和采购人信息。", "上传招标主文件及相关招标文件；原始文件将由本地服务保存和解析。", "确认后先创建项目和文件记录，再启动 Agent 在工作台中持续分析。 "][step]; }
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <label className="form-field"><span>{label}{required && <em>必填</em>}</span>{children}</label>; }
function Review({ label, value }: { label: string; value: string }) { return <div className="review-item"><span>{label}</span><strong>{value}</strong></div>; }
function UploadArea({ files, onFiles, onDrop, onRemove }: { files: UploadFile[]; onFiles: (files: FileList) => void; onDrop: (event: DragEvent<HTMLDivElement>) => void; onRemove: (name: string) => void }) {
  return <div><div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><UploadCloud size={30} /><strong>上传招标文件</strong><p>拖拽文件到此处，或选择文件。支持 PDF、DOCX、XLSX。</p><label className="button"><input className="sr-only" type="file" multiple accept=".pdf,.docx,.xlsx" onChange={(event) => event.target.files && onFiles(event.target.files)} />选择文件</label></div>{files.length > 0 && <div className="upload-list">{files.map((file) => <div key={file.name}><span className="file-icon"><FileText size={17} /></span><span><strong>{file.name}</strong><small>{file.type} · {(file.size / 1024).toFixed(1)} KB · 等待上传</small></span><span className="upload-status"><Check size={13} />已就绪</span><button className="icon-button" type="button" aria-label={`移除 ${file.name}`} onClick={() => onRemove(file.name)}><X size={14} /></button></div>)}</div>}</div>;
}
