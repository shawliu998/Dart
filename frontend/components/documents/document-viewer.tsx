"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  LoaderCircle,
  LockKeyhole,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import styles from "./document-viewer.module.css";

export type DocumentState =
  "ready" | "loading" | "error" | "permission" | "deleted";

export interface DocumentViewerProps {
  name: string;
  url?: string;
  state?: DocumentState;
  initialPage?: number;
  pageCount?: number;
  initialZoom?: number;
  excerpt?: string;
  focusLabel?: string;
  sourceLocation?: string;
  demo?: boolean;
  onPageChange?: (page: number) => void;
}

const stateCopy: Record<
  Exclude<DocumentState, "ready">,
  { title: string; detail: string; icon: React.ReactNode }
> = {
  loading: {
    title: "正在加载文档",
    detail: "正在获取受控文件与页码信息，请稍候。",
    icon: <LoaderCircle className={styles.spin} />,
  },
  error: {
    title: "文档加载失败",
    detail: "文件服务暂不可用或格式无法预览。原始来源信息仍保留。",
    icon: <AlertCircle />,
  },
  permission: {
    title: "无权查看此文档",
    detail: "当前账号没有材料查看权限，请联系项目管理员。",
    icon: <LockKeyhole />,
  },
  deleted: {
    title: "文档已删除",
    detail: "文件已从当前版本移除；审计与来源引用不会被覆盖。",
    icon: <Trash2 />,
  },
};

export function DocumentViewer({
  name,
  url,
  state = "ready",
  initialPage = 1,
  pageCount = 1,
  initialZoom = 100,
  excerpt,
  focusLabel,
  sourceLocation,
  demo = !url,
  onPageChange,
}: DocumentViewerProps) {
  const safePageCount = Math.max(1, pageCount);
  const [page, setPage] = useState(
    Math.min(Math.max(initialPage, 1), safePageCount),
  );
  const [zoom, setZoom] = useState(Math.min(Math.max(initialZoom, 50), 180));
  const [frameLoading, setFrameLoading] = useState(Boolean(url));
  const [frameFailed, setFrameFailed] = useState(false);

  const framedUrl = useMemo(() => {
    if (!url) return undefined;
    const separator = url.includes("#") ? "&" : "#";
    return `${url}${separator}page=${page}&zoom=${zoom}`;
  }, [page, url, zoom]);

  function go(next: number) {
    const safe = Math.min(Math.max(next, 1), safePageCount);
    setPage(safe);
    if (url) {
      setFrameLoading(true);
      setFrameFailed(false);
    }
    onPageChange?.(safe);
  }

  const visibleState: DocumentState = frameFailed ? "error" : state;
  const unavailable = visibleState !== "ready" ? stateCopy[visibleState] : null;

  return (
    <section
      className={styles.viewer}
      aria-label={`${name} 文档预览`}
      data-document-state={visibleState}
    >
      <header className={styles.header}>
        <div>
          <strong>{name}</strong>
          <small>
            {demo ? "演示来源 · 未请求真实文件" : "受控文件 URL"}
            {sourceLocation ? ` · ${sourceLocation}` : ""}
          </small>
        </div>
        <div className={styles.controls} aria-label="文档查看控制">
          <button
            type="button"
            aria-label="上一页"
            disabled={page <= 1 || visibleState !== "ready"}
            onClick={() => go(page - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          <label>
            <span className="sr-only">页码</span>
            <input
              aria-label="页码"
              type="number"
              min={1}
              max={safePageCount}
              value={page}
              onChange={(event) => go(Number(event.target.value))}
            />
          </label>
          <span>/ {safePageCount}</span>
          <button
            type="button"
            aria-label="下一页"
            disabled={page >= safePageCount || visibleState !== "ready"}
            onClick={() => go(page + 1)}
          >
            <ChevronRight size={14} />
          </button>
          <i />
          <button
            type="button"
            aria-label="缩小文档"
            disabled={visibleState !== "ready"}
            onClick={() => setZoom((value) => Math.max(50, value - 10))}
          >
            <Minus size={14} />
          </button>
          <span>{zoom}%</span>
          <button
            type="button"
            aria-label="放大文档"
            disabled={visibleState !== "ready"}
            onClick={() => setZoom((value) => Math.min(180, value + 10))}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            aria-label="重置文档缩放"
            disabled={visibleState !== "ready"}
            onClick={() => setZoom(100)}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </header>
      <div className={styles.viewport}>
        {unavailable ? (
          <div
            className={styles.state}
            role={visibleState === "loading" ? "status" : "alert"}
          >
            {unavailable.icon}
            <strong>{unavailable.title}</strong>
            <p>{unavailable.detail}</p>
            <small>
              {name}
              {sourceLocation ? ` · ${sourceLocation}` : ""}
            </small>
          </div>
        ) : framedUrl ? (
          <>
            {frameLoading && (
              <div className={styles.overlay} role="status">
                <LoaderCircle className={styles.spin} />
                正在加载第 {page} 页…
              </div>
            )}
            <iframe
              key={framedUrl}
              src={framedUrl}
              title={`${name} 第 ${page} 页`}
              onLoad={() => setFrameLoading(false)}
              onError={() => {
                setFrameLoading(false);
                setFrameFailed(true);
              }}
            />
          </>
        ) : (
          <div
            className={styles.demoPage}
            style={{ width: `${Math.min(zoom, 125)}%` }}
          >
            <div>
              <span>BidEvidence 文档定位预览</span>
              <span>第 {page} 页</span>
            </div>
            <h3>{focusLabel ?? "来源页内容"}</h3>
            <p>
              {excerpt ??
                "当前记录保留了文件名、页码和摘录。连接文件服务后，此处会加载真实 PDF URL。"}
            </p>
            {focusLabel && <mark>{focusLabel}</mark>}
            <small>
              <FileQuestion size={13} />
              演示模式不伪造原始版式；请以来源文件为准。
            </small>
          </div>
        )}
      </div>
      <footer className={styles.footer}>
        <strong>第 {page} 页</strong>
        <span>缩放 {zoom}%</span>
        <span>{sourceLocation ?? "未提供条款定位"}</span>
      </footer>
    </section>
  );
}

export function DocumentDialog({
  open,
  onClose,
  title = "查看来源",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-dialog-title"
      >
        <div className={styles.dialogTitle}>
          <h2 id="document-dialog-title">{title}</h2>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
