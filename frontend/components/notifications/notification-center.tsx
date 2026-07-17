"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, Bell, Check, Clock3, FileCheck2, X } from "lucide-react";
import type { ProjectContext } from "@/lib/product-context";

interface ProductNotification { id: string; title: string; detail: string; time: string; tone: "danger" | "warning" | "info"; read: boolean; route: string; projectId?: string; }

const initialNotifications: ProductNotification[] = [
  { id: "notice-risk", title: "报价仍超过最高限价", detail: "智慧园区项目的报价高出 10,000 元。", time: "8 分钟前", tone: "danger", read: false, route: "/projects/8b6b7330-8fe3-4a95-85df-2a5a9183fe01/disqualifications", projectId: "8b6b7330-8fe3-4a95-85df-2a5a9183fe01" },
  { id: "notice-review", title: "2 条低置信度要求待复核", detail: "置信度低于 70%，系统未自动确认。", time: "32 分钟前", tone: "warning", read: false, route: "/projects/8b6b7330-8fe3-4a95-85df-2a5a9183fe01/requirements", projectId: "8b6b7330-8fe3-4a95-85df-2a5a9183fe01" },
  { id: "notice-package", title: "封装包检查完成", detail: "发现 2 个阻塞问题和 3 个警告。", time: "1 小时前", tone: "info", read: false, route: "/projects/8b6b7330-8fe3-4a95-85df-2a5a9183fe01/package", projectId: "8b6b7330-8fe3-4a95-85df-2a5a9183fe01" },
  { id: "notice-material", title: "ISO 27001 证书已过期", detail: "请上传续证材料并重新关联证据。", time: "昨天", tone: "warning", read: true, route: "/evidence" },
];

export function NotificationCenter({ project }: { project: ProjectContext | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const visible = useMemo(() => project ? notifications.filter((item) => !item.projectId || item.projectId === project.id) : notifications, [notifications, project]);
  const unread = visible.filter((item) => !item.read).length;

  function openNotification(item: ProductNotification) { setNotifications((items) => items.map((notification) => notification.id === item.id ? { ...notification, read: true } : notification)); setOpen(false); router.push(item.route); }
  return <div className="notification-center"><button className="icon-button" type="button" aria-label={`通知（${unread} 条未读）`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Bell size={18} />{unread > 0 && <span className="notification-dot">{unread}</span>}</button>{open && <section className="notification-popover" aria-label="通知中心"><header><span><strong>通知中心</strong><small>{project ? project.name : "全部工作空间"}</small><em>来源：确定性演示 · API 通知尚未接入</em></span><button type="button" aria-label="关闭通知中心" onClick={() => setOpen(false)}><X size={16} /></button></header><div>{visible.map((item) => { const Icon = item.tone === "danger" ? AlertOctagon : item.tone === "warning" ? Clock3 : FileCheck2; return <button key={item.id} type="button" className={item.read ? "read" : ""} onClick={() => openNotification(item)}><span className={`notification-icon ${item.tone}`}><Icon size={16} /></span><span><strong>{item.title}</strong><small>{item.detail}</small><em>{item.time}</em></span>{!item.read && <i aria-label="未读" />}</button>; })}</div><footer><button type="button" onClick={() => setNotifications((items) => items.map((item) => ({ ...item, read: true })))}><Check size={14} />全部标为已读</button><button type="button" onClick={() => { setOpen(false); router.push("/tasks"); }}>查看全部待办</button></footer></section>}</div>;
}
