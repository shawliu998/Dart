const configuredApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL;
export const API_BASE_URL = configuredApiUrl ?? "http://localhost:8000";
export const isRemoteApiConfigured = Boolean(configuredApiUrl);

const demoIdentityHeaders = {
  "X-Tenant-ID": process.env.NEXT_PUBLIC_TENANT_ID ?? "00000000-0000-0000-0000-000000000001",
  "X-User-ID": process.env.NEXT_PUBLIC_USER_ID ?? "00000000-0000-0000-0000-000000000002",
  "X-Role": process.env.NEXT_PUBLIC_USER_ROLE ?? "admin",
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  let authorization: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try { const session = JSON.parse(localStorage.getItem("bidevidence.session") ?? "null") as { accessToken?: string } | null; if (session?.accessToken) authorization = { Authorization: `Bearer ${session.accessToken}` }; } catch { /* malformed local session falls back to demo headers */ }
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(!isFormData ? { "Content-Type": "application/json" } : {}), ...(authorization.Authorization ? authorization : demoIdentityHeaders), ...init?.headers },
  });
  if (!response.ok) {
    throw new Error(`API_${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiDownload(path: string): Promise<Blob> {
  let headers: Record<string, string> = { ...demoIdentityHeaders };
  if (typeof window !== "undefined") {
    try { const session = JSON.parse(localStorage.getItem("bidevidence.session") ?? "null") as { accessToken?: string } | null; if (session?.accessToken) headers = { Authorization: `Bearer ${session.accessToken}` }; } catch { /* keep demo identity headers */ }
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) throw new Error(`API_${response.status}`);
  return response.blob();
}
