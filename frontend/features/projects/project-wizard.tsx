"use client";

import { DragEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, FileArchive, FileText, LoaderCircle, UploadCloud, X } from "lucide-react";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { isDemoMode } from "@/lib/api/client";
import { projectApi } from "@/lib/api/projects";

const steps = ["基本信息", "招标文件", "项目附件", "补充公告", "企业主体", "材料范围", "确认解析"];
type DocumentType = "tender_main" | "tender_attachment" | "amendment";
type UploadFile = { name: string; size: number; type: string; status: "ready" | "done"; file: File; documentType: DocumentType };

export function ProjectWizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("智慧园区综合管理平台采购项目");
  const [code, setCode] = useState("2026-ZHYY-001");
  const [buyer, setBuyer] = useState("某市产业园区管理委员会");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [complete, setComplete] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState(DEMO_PROJECT_ID);
  const remoteMode = !isDemoMode;
  const canContinue = useMemo(() => step !== 0 || Boolean(name && code && buyer), [buyer, code, name, step]);

  function addFiles(fileList: FileList | File[], documentType: DocumentType) {
    const incoming = Array.from(fileList).map((file) => ({ name: file.name, size: file.size, type: file.name.split(".").pop()?.toUpperCase() ?? "FILE", status: "done" as const, file, documentType }));
    setFiles((current) => [...current, ...incoming.filter((item) => !current.some((existing) => existing.name === item.name))]);
  }

  function drop(event: DragEvent<HTMLDivElement>, documentType: DocumentType) {
    event.preventDefault();
    addFiles(event.dataTransfer.files, documentType);
  }

  async function startParsing() {
    setWorkflowError(""); setParsing(true); setProgress(5);
    if (!remoteMode) {
      setCurrentStep("本地演示：加载确定性解析结果");
      window.setTimeout(() => { setProgress(100); setParsing(false); setComplete(true); }, 900);
      return;
    }
    if (!files[0]?.file) {
      setParsing(false); setProgress(0); setWorkflowError("连接后端模式至少需要上传一份招标主文件。可返回“招标文件”步骤上传，或切换本地演示。 ");
      return;
    }
    try {
      setCurrentStep("创建项目");
      const project = await projectApi.create({ name, projectCode: code, buyerName: buyer });
      setCreatedProjectId(project.id); setProgress(20);
      setCurrentStep(`上传 ${files.length} 个文件`);
      const documents = await Promise.all(files.map((item) => projectApi.uploadDocument(project.id, item.file, item.documentType)));
      const tenderDocument = documents[files.findIndex((item) => item.documentType === "tender_main")];
      if (!tenderDocument) throw new Error("缺少招标主文件");
      setProgress(45); setCurrentStep("提交文档解析任务");
      const parseResult = await projectApi.parseDocument(tenderDocument.id);
      await waitForJob(parseResult.job_id, 45, 65, "后端正在解析文档");
      setProgress(67); setCurrentStep("提取结构化招标要求");
      const extractResult = await projectApi.extractRequirements(project.id, tenderDocument.id);
      await waitForJob(extractResult.job_id, 67, 88, "后端正在提取要求");
      setProgress(90); setCurrentStep("检测否决项候选");
      const detectionResult = await projectApi.detectDisqualifications(project.id);
      await waitForJob(detectionResult.job_id, 90, 99, "后端正在检测否决项");
      setProgress(100); setCurrentStep("解析、要求提取与否决项检测完成"); setComplete(true);
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "后端工作流执行失败");
    } finally { setParsing(false); }
  }

  async function waitForJob(jobId: string | undefined, min: number, max: number, fallbackStep: string) {
    if (!jobId) return;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const job = await projectApi.job(jobId);
      const normalized = typeof job.progress === "number" && job.progress <= 1 ? job.progress * 100 : (job.progress ?? attempt * 2.5);
      setProgress(Math.round(min + (max - min) * Math.min(100, normalized) / 100));
      setCurrentStep(job.current_step ?? fallbackStep);
      if (["completed", "succeeded", "success"].includes(job.status)) return;
      if (["failed", "error"].includes(job.status)) throw new Error(job.error ?? `${fallbackStep}失败`);
      await new Promise((resolve) => window.setTimeout(resolve, 750));
    }
    throw new Error(`${fallbackStep}轮询超时，请稍后重试`);
  }

  return (
    <div className="page wizard-page">
      <header className="page-header">
        <div className="page-title-group"><Link className="back-link" href="/projects"><ArrowLeft size={14} />返回项目</Link><h1>新建投标项目</h1><p>按步骤准备文件和企业材料范围，确认后开始可审计解析。</p></div>
      </header>

      <ol className="wizard-steps" aria-label="创建项目步骤">{steps.map((label, index) => <li key={label} className={index === step ? "current" : index < step ? "done" : ""} aria-current={index === step ? "step" : undefined}><span>{index < step ? <Check size={13} /> : index + 1}</span><strong>{label}</strong></li>)}</ol>

      <section className="panel wizard-panel">
        <div className="wizard-heading"><span>步骤 {step + 1} / {steps.length}</span><h2>{steps[step]}</h2><p>{wizardDescription(step)}</p></div>
        <div className="wizard-body">
          {step === 0 && <div className="form-grid"><Field label="项目名称" required><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="项目编号" required><input value={code} onChange={(event) => setCode(event.target.value)} /></Field><Field label="采购人" required><input value={buyer} onChange={(event) => setBuyer(event.target.value)} /></Field><Field label="投标截止时间"><input type="datetime-local" defaultValue="2026-07-30T09:30" /></Field><Field label="预算金额（元）"><input inputMode="decimal" defaultValue="5900000" /></Field><Field label="项目负责人"><select defaultValue="刘敏"><option>刘敏</option><option>周扬</option></select></Field></div>}
          {step >= 1 && step <= 3 && <UploadArea files={files.filter((file) => file.documentType === documentTypeForStep(step))} onFiles={(selected) => addFiles(selected, documentTypeForStep(step))} onDrop={(event) => drop(event, documentTypeForStep(step))} onRemove={(name) => setFiles((current) => current.filter((file) => file.name !== name))} hint={step === 1 ? "上传招标主文件" : step === 2 ? "上传技术、商务及报价附件" : "上传补充公告或澄清文件（可暂时跳过）"} />}
          {step === 4 && <div className="choice-list"><label className="choice-card selected"><input type="radio" name="entity" defaultChecked /><span><strong>上海智园数字科技有限公司</strong><small>统一社会信用代码：9131**********4X · 主体材料 32 份</small></span><Check size={18} /></label><label className="choice-card"><input type="radio" name="entity" /><span><strong>上海智园科技有限公司</strong><small>投标函中的不一致名称 · 需人工核验</small></span></label></div>}
          {step === 5 && <div className="scope-list">{["主体资质与许可证", "管理体系认证", "项目案例与验收材料", "人员证书与社保证明", "标准产品与服务说明"].map((scope, index) => <label key={scope}><input type="checkbox" defaultChecked={index < 4} /><span><strong>{scope}</strong><small>{["12 份材料", "8 份材料 · 1 份即将过期", "17 组证据链", "24 份材料", "36 条标准内容"][index]}</small></span></label>)}</div>}
          {step === 6 && !complete && <div className="review-grid"><Review label="项目" value={`${name} · ${code}`} /><Review label="采购人" value={buyer} /><Review label="企业主体" value="上海智园数字科技有限公司" /><Review label="待处理文件" value={`${files.length} 个已选择文件 · SHA256 由服务端验证`} /><Review label="运行模式" value={remoteMode ? "本地 API · 创建 / 上传 / 解析 / 进度轮询" : "本地确定性演示 · 不写入后端"} /><Review label="解析策略" value="Docling 优先 · 扫描页自动 OCR · 低置信度转人工复核" /><div className="safety-note"><FileArchive size={18} /><span><strong>解析不会直接形成最终合规结论</strong><small>所有要求、否决项候选与低置信度结果都保留来源，并进入人工确认。</small></span></div>{(parsing || workflowError) && <div className={workflowError ? "workflow-status error" : "workflow-status"}><strong>{workflowError || currentStep}</strong>{parsing && <div className="workflow-progress"><span style={{ width: `${progress}%` }} /><em>{progress}%</em></div>}</div>}</div>}
          {step === 6 && complete && <div className="parse-complete"><span><Check size={28} /></span><h2>项目已创建，首批文件解析完成</h2><p>{remoteMode ? "后端解析任务已成功完成。请进入工作台查看服务端返回的要求和来源。" : "本地演示已加载 20 条招标要求，其中 3 项进入否决项复核；本次操作未写入后端。"}</p><Link className="button primary" href={`/projects/${createdProjectId}/requirements`}>进入要求工作台<ArrowRight size={15} /></Link></div>}
        </div>
        {!complete && <footer className="wizard-footer"><button className="button" type="button" disabled={step === 0 || parsing} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft size={14} />上一步</button><span>草稿已保存在本地演示会话</span>{step < steps.length - 1 ? <button className="button primary" type="button" disabled={!canContinue} onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>下一步<ArrowRight size={14} /></button> : <button className="button primary" type="button" disabled={parsing} onClick={startParsing}>{parsing ? <><LoaderCircle className="spin" size={15} />正在解析</> : <><UploadCloud size={15} />确认并开始解析</>}</button>}</footer>}
      </section>
    </div>
  );
}

function wizardDescription(step: number) { return ["录入招标项目的基础信息和关键时间点。", "上传招标文件主文档，系统将保留原始哈希和页码。", "上传技术、商务和报价等附件。", "补充公告会作为独立版本解析并分析影响。", "所有证据与结论都绑定明确的法律主体。", "选择本项目允许检索的企业材料范围。", "复核配置后开始解析、要求提取和否决项检测。"][step]; }
function documentTypeForStep(step: number): DocumentType { return step === 1 ? "tender_main" : step === 2 ? "tender_attachment" : "amendment"; }
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <label className="form-field"><span>{label}{required && <em>必填</em>}</span>{children}</label>; }
function Review({ label, value }: { label: string; value: string }) { return <div className="review-item"><span>{label}</span><strong>{value}</strong></div>; }
function UploadArea({ files, onFiles, onDrop, onRemove, hint }: { files: UploadFile[]; onFiles: (files: FileList) => void; onDrop: (event: DragEvent<HTMLDivElement>) => void; onRemove: (name: string) => void; hint: string }) {
  return <div><div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><UploadCloud size={30} /><strong>{hint}</strong><p>拖拽文件到此处，或选择文件。支持 PDF、DOCX、XLSX、图片和 ZIP。</p><label className="button"><input className="sr-only" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip" onChange={(event) => event.target.files && onFiles(event.target.files)} />选择文件</label></div>{files.length > 0 && <div className="upload-list">{files.map((file) => <div key={file.name}><span className="file-icon"><FileText size={17} /></span><span><strong>{file.name}</strong><small>{file.type} · {(file.size / 1024).toFixed(1)} KB · 哈希已计算 · 等待解析</small></span><span className="upload-status"><Check size={13} />已就绪</span><button className="icon-button" type="button" aria-label={`移除 ${file.name}`} onClick={() => onRemove(file.name)}><X size={14} /></button></div>)}</div>}</div>;
}
