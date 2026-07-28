const configuredApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL;
export const API_BASE_URL = configuredApiUrl ?? "http://localhost:8000";
/** Demo data is opt-in. The desktop app always talks to its local loopback API. */
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const isRemoteApiConfigured = !isDemoMode;

const demoIdentityHeaders = {
  "X-Tenant-ID": process.env.NEXT_PUBLIC_TENANT_ID ?? "00000000-0000-0000-0000-000000000001",
  "X-User-ID": process.env.NEXT_PUBLIC_USER_ID ?? "00000000-0000-0000-0000-000000000002",
  "X-Role": process.env.NEXT_PUBLIC_USER_ROLE ?? "admin",
};

export type DesktopRuntime = { desktop: true };

declare global {
  interface Window {
    bidevidenceDesktop?: { runtimeInfo: DesktopRuntime };
  }
}

async function requestTarget(): Promise<{ baseUrl: string; headers: Record<string, string> }> {
  if (typeof window !== "undefined" && window.bidevidenceDesktop) {
    void window.bidevidenceDesktop.runtimeInfo;
    return { baseUrl: "", headers: {} };
  }
  if (typeof window === "undefined" && process.env.BIDEVIDENCE_BACKEND_URL) return {
    baseUrl: process.env.BIDEVIDENCE_BACKEND_URL,
    headers: process.env.BIDEVIDENCE_DESKTOP_TOKEN ? { Authorization: `Bearer ${process.env.BIDEVIDENCE_DESKTOP_TOKEN}` } : {},
  };
  let authorization: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try { const session = JSON.parse(localStorage.getItem("bidevidence.session") ?? "null") as { accessToken?: string } | null; if (session?.accessToken) authorization = { Authorization: `Bearer ${session.accessToken}` }; } catch { /* malformed local session uses configured development identity */ }
  }
  return { baseUrl: API_BASE_URL, headers: authorization.Authorization ? authorization : demoIdentityHeaders };
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const target = await requestTarget();
  const response = await fetch(`${target.baseUrl}${path}`, {
    ...init,
    headers: { ...(!isFormData ? { "Content-Type": "application/json" } : {}), ...target.headers, ...init?.headers },
  });
  if (!response.ok) {
    let code = `API_${response.status}`;
    try {
      const body = await response.json() as { detail?: { code?: unknown } };
      if (typeof body.detail?.code === "string") code = body.detail.code;
    } catch {
      // Non-JSON failures keep their stable HTTP status code.
    }
    throw new Error(code);
  }
  return response.json() as Promise<T>;
}

export async function apiDownload(path: string): Promise<Blob> {
  const target = await requestTarget();
  const response = await fetch(`${target.baseUrl}${path}`, { headers: target.headers });
  if (!response.ok) throw new Error(`API_${response.status}`);
  return response.blob();
}
