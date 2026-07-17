import path from "node:path";
import { app, BrowserWindow, session, shell } from "electron";

import { registerIpcHandlers } from "./ipc";
import { ensureAppPaths, type AppPaths } from "./paths";
import { RuntimeSupervisor, type SupervisorStatus } from "./supervisor";

let mainWindow: BrowserWindow | undefined;
let supervisor: RuntimeSupervisor | undefined;
let lastStatus: SupervisorStatus | undefined;
let quitting = false;

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character] ?? character);
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, " ").slice(0, 300);
}

function urlOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Only the configured loopback frontend origin may navigate in-window; everything else is blocked.
 * Well-formed external http(s) links are handed to the OS, never opened in this app.
 */
function installNavigationPolicy(window: BrowserWindow, allowedOrigin: string | undefined): void {
  const isAllowed = (value: string): boolean => allowedOrigin !== undefined && urlOrigin(value) === allowedOrigin;
  const openIfExternalHttp = (value: string): void => {
    try {
      const url = new URL(value);
      const isHttp = url.protocol === "https:" || url.protocol === "http:";
      if (isHttp && url.origin !== allowedOrigin) void shell.openExternal(url.toString());
    } catch {
      // Malformed URLs are denied by doing nothing.
    }
  };

  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (isAllowed(navigationUrl)) return;
    event.preventDefault();
    openIfExternalHttp(navigationUrl);
  });
  window.webContents.on("will-redirect", (event, redirectUrl) => {
    if (!isAllowed(redirectUrl)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

function createMainWindow(allowedOrigin: string | undefined): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  installNavigationPolicy(window, allowedOrigin);
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  if (process.env.BIDEVIDENCE_DESKTOP_DEVTOOLS === "1") {
    window.webContents.openDevTools({ mode: "detach" });
  }
  return window;
}

function renderFailurePage(paths: AppPaths, status: SupervisorStatus): string {
  const lines = [
    ...status.errors,
    ...status.services
      .filter((service) => !service.ready)
      .map((service) => `${service.name}: ${service.detail} (${service.healthUrl})`),
  ];
  const items = (lines.length > 0 ? lines : ["未知启动错误 / unknown startup error"])
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  return [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    "<title>BidEvidence 桌面端启动失败</title>",
    "<style>body{font-family:system-ui,sans-serif;margin:3rem auto;max-width:46rem;line-height:1.6;color:#1c2430}",
    "h1{font-size:1.4rem}li{word-break:break-all}code{background:#f0f2f5;padding:0 0.3rem;border-radius:4px}</style>",
    "</head><body>",
    "<h1>本地服务未启动 / Local services unavailable</h1>",
    "<p>桌面端只会在本地后端与前端通过健康检查后加载界面。请确认服务已在运行，或检查 <code>BIDEVIDENCE_DESKTOP_*</code> 环境变量配置。</p>",
    `<ul>${items}</ul>`,
    `<p>日志目录 / Logs: <code>${escapeHtml(paths.logs)}</code></p>`,
    "</body></html>",
  ].join("");
}

async function showFailurePage(window: BrowserWindow, paths: AppPaths, status: SupervisorStatus): Promise<void> {
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderFailurePage(paths, status))}`);
}

/** Starts (or re-checks) the supervised services, then loads the frontend only when it is ready. */
async function launch(paths: AppPaths): Promise<void> {
  if (!supervisor) return;
  if (!lastStatus || !lastStatus.ready) {
    try {
      lastStatus = await supervisor.start();
    } catch (error) {
      lastStatus = { ready: false, frontendOrigin: undefined, services: [], errors: [errorMessage(error)] };
    }
  }
  const allowedOrigin = lastStatus.frontendOrigin === undefined ? undefined : urlOrigin(lastStatus.frontendOrigin);
  const window = createMainWindow(allowedOrigin);
  mainWindow = window;
  try {
    if (lastStatus.ready && lastStatus.frontendOrigin !== undefined) {
      await window.loadURL(lastStatus.frontendOrigin);
    } else {
      await showFailurePage(window, paths, lastStatus);
    }
  } catch (error) {
    await showFailurePage(window, paths, {
      ready: false,
      frontendOrigin: lastStatus.frontendOrigin,
      services: [],
      errors: [`前端页面加载失败 / failed to load the frontend: ${errorMessage(error)}`],
    });
  }
}

async function boot(): Promise<void> {
  // The host needs no renderer permissions (media, notifications, HID, ...): deny them all.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  const paths = ensureAppPaths(app.getPath("userData"));
  registerIpcHandlers(paths);
  supervisor = new RuntimeSupervisor(paths);

  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    void (supervisor ? supervisor.stop() : Promise.resolve()).finally(() => app.quit());
  });
  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => {
    if (!mainWindow) void launch(paths);
  });

  await launch(paths);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  void app.whenReady().then(boot).catch((error: unknown) => {
    console.error("[desktop] fatal startup error:", errorMessage(error));
    app.exit(1);
  });
}
