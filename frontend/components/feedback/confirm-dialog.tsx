"use client";

import { AlertTriangle, X } from "lucide-react";

type ReasonField = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minLength?: number;
};

export function ConfirmDialog({ open, title, description, confirmLabel = "确认", tone = "default", reason, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel?: string; tone?: "default" | "danger"; reason?: ReasonField; onConfirm: () => void; onClose: () => void }) {
  if (!open) return null;
  const minimumReasonLength = reason?.minLength ?? 6;
  const reasonMissing = Boolean(reason && reason.value.trim().length < minimumReasonLength);
  return <div className="dialog-backdrop v2-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog v2-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description"><header className="dialog-title"><span className={`confirm-dialog-icon ${tone}`}><AlertTriangle size={18} /></span><div><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-description">{description}</p></div><button className="icon-button" type="button" aria-label="关闭对话框" onClick={onClose}><X size={16} /></button></header>{reason && <label className="form-field"><span>{reason.label} <em>必填</em></span><textarea aria-label={reason.label} rows={3} value={reason.value} onChange={(event) => reason.onChange(event.target.value)} placeholder={reason.placeholder} /><small>至少填写 {minimumReasonLength} 个字符；内容将进入审计上下文。</small></label>}<footer className="dialog-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className={tone === "danger" ? "button danger" : "button primary"} type="button" disabled={reasonMissing} onClick={onConfirm}>{confirmLabel}</button></footer></section></div>;
}
