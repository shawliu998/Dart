import { apiRequest, isRemoteApiConfigured } from "./client";
import type { DataSource } from "@/lib/phase-data/types";

export interface SessionUser { id: string; name: string; email: string; role: string; source: DataSource; accessToken?: string; }
const demoUser: SessionUser = { id: "00000000-0000-0000-0000-000000000002", name: "刘敏", email: "admin@demo.local", role: "投标经理 / admin", source: "demo" };

export async function login(email: string, password: string): Promise<SessionUser> {
  if (isRemoteApiConfigured) {
    const dto = await apiRequest<Record<string, unknown>>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    const user = (dto.user && typeof dto.user === "object" ? dto.user : dto) as Record<string, unknown>;
    const accessToken = String(dto.access_token ?? dto.accessToken ?? "");
    if (!accessToken) throw new Error("登录响应缺少 access_token");
    return { id: String(user.id ?? user.user_id ?? ""), name: String(user.name ?? user.display_name ?? "用户"), email: String(user.email ?? email), role: String(user.role ?? "viewer"), source: "api", accessToken };
  }
  throw new Error("未配置认证 API。请选择“进入本地演示”创建浏览器演示会话。");
}

export function startDemoSession() { return demoUser; }

export function saveSession(user: SessionUser) { localStorage.setItem("bidevidence.session", JSON.stringify(user)); window.dispatchEvent(new Event("bidevidence-session")); }
export function loadSession(): SessionUser | null { try { const raw = localStorage.getItem("bidevidence.session"); return raw ? JSON.parse(raw) as SessionUser : null; } catch { return null; } }
export function clearSession() { localStorage.removeItem("bidevidence.session"); window.dispatchEvent(new Event("bidevidence-session")); }
export function sessionSnapshot() { return typeof window === "undefined" ? null : localStorage.getItem("bidevidence.session"); }
export function subscribeSession(callback: () => void) { window.addEventListener("bidevidence-session", callback); window.addEventListener("storage", callback); return () => { window.removeEventListener("bidevidence-session", callback); window.removeEventListener("storage", callback); }; }
export { demoUser };
