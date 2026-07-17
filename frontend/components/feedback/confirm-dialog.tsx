"use client";

import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({ open, title, description, confirmLabel = "确认", tone = "default", onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel?: string; tone?: "default" | "danger"; onConfirm: () => void; onClose: () => void }) {
  if (!open) return null;
  return <div className="dialog-backdrop v2-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog v2-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description"><header className="dialog-title"><span className={`confirm-dialog-icon ${tone}`}><AlertTriangle size={18} /></span><div><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-description">{description}</p></div><button className="icon-button" type="button" aria-label="关闭对话框" onClick={onClose}><X size={16} /></button></header><footer className="dialog-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className={tone === "danger" ? "button danger" : "button primary"} type="button" onClick={onConfirm}>{confirmLabel}</button></footer></section></div>;
}
