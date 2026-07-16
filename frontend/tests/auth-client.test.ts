import { vi } from "vitest";
import { apiRequest } from "@/lib/api/client";
import { clearSession, saveSession, startDemoSession } from "@/lib/api/auth";

describe("authentication client", () => {
  afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

  it("requires an explicit demo session choice", () => {
    expect(localStorage.getItem("bidevidence.session")).toBeNull();
    saveSession(startDemoSession());
    expect(JSON.parse(localStorage.getItem("bidevidence.session") ?? "{}")).toMatchObject({ email: "admin@demo.local", source: "demo" });
  });

  it("prioritizes Bearer authorization over demo identity headers", async () => {
    localStorage.setItem("bidevidence.session", JSON.stringify({ accessToken: "token-123", source: "api" }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }); vi.stubGlobal("fetch", fetchMock);
    await apiRequest("/api/protected");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-123" });
    expect(init.headers).not.toHaveProperty("X-Role");
  });
});
