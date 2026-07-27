import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const liveApiBaseUrl = process.env.E2E_LIVE_API_BASE_URL?.replace(/\/$/, "");
const liveApiMode = Boolean(liveApiBaseUrl);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: !liveApiMode,
  workers: liveApiMode ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    env: {
      ...process.env,
      NEXT_PUBLIC_DEMO_MODE: liveApiMode ? "false" : "true",
      ...(liveApiBaseUrl
        ? { NEXT_PUBLIC_API_BASE_URL: liveApiBaseUrl }
        : {}),
    },
    url: `${baseURL}/projects`,
    reuseExistingServer: liveApiMode ? false : !process.env.CI,
    timeout: 120_000,
  },
});
