import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createWriteStream, existsSync, readFileSync, writeFileSync, type WriteStream } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import type { AppPaths } from "./paths";

type ServiceName = "backend" | "frontend";

interface ServiceConfig {
  readonly name: ServiceName;
  readonly command?: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly host: string;
  readonly port: number;
  readonly healthPath: string;
}

export interface BundledService {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export interface BundledRuntime {
  readonly backend: BundledService;
  readonly frontend: BundledService;
}

export interface ServiceStatus {
  readonly name: ServiceName;
  /** true when this supervisor spawned the process, false when it only probed an external one. */
  readonly managed: boolean;
  readonly ready: boolean;
  readonly healthUrl: string;
  readonly detail: string;
}

export interface SupervisorStatus {
  /** true only when every service passed its health check; never claimed otherwise. */
  readonly ready: boolean;
  readonly frontendOrigin: string | undefined;
  readonly services: readonly ServiceStatus[];
  readonly errors: readonly string[];
}

interface RunningService {
  readonly name: ServiceName;
  readonly child: ChildProcess;
  readonly logStream: WriteStream;
  spawnError?: string;
  exitDetail?: string;
}

interface LocalIdentity { readonly tenantId: string; readonly userId: string; }

function loadOrCreateIdentity(dataDirectory: string): LocalIdentity {
  const file = path.join(dataDirectory, "local-identity.json");
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<LocalIdentity>;
    if (typeof parsed.tenantId === "string" && typeof parsed.userId === "string") return parsed as LocalIdentity;
  }
  const identity = { tenantId: randomUUID(), userId: randomUUID() };
  writeFileSync(file, JSON.stringify(identity), { mode: 0o600 });
  return identity;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const HEALTH_DELAY_MS = 500;
const HEALTH_REQUEST_TIMEOUT_MS = 1_500;
const SPAWNED_HEALTH_BUDGET_MS = 60_000;
const EXTERNAL_HEALTH_BUDGET_MS = 10_000;
const SIGTERM_GRACE_MS = 5_000;
const SIGKILL_GRACE_MS = 1_000;

const SERVICE_DEFAULTS: Record<ServiceName, { port: number; healthPath: string }> = {
  backend: { port: 8000, healthPath: "/health" },
  frontend: { port: 3000, healthPath: "/" },
};

function envPrefix(name: ServiceName): string {
  return `BIDEVIDENCE_DESKTOP_${name.toUpperCase()}`;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePort(value: string, label: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label}_PORT must be an integer between 1 and 65535`);
  }
  return port;
}

function parseArgs(value: string | undefined, label: string): readonly string[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label}_ARGS must be a JSON string array`);
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error(`${label}_ARGS must be a JSON string array`);
  }
  return parsed;
}

function getServiceConfig(
  name: ServiceName,
  bundled?: BundledService,
): ServiceConfig {
  const prefix = envPrefix(name);
  const defaults = SERVICE_DEFAULTS[name];
  const host = nonEmpty(process.env[`${prefix}_HOST`]) ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`${prefix}_HOST must be a loopback address (127.0.0.1, ::1 or localhost)`);
  }
  const portValue = nonEmpty(process.env[`${prefix}_PORT`]);
  const healthPath = nonEmpty(process.env[`${prefix}_HEALTH_PATH`]) ?? defaults.healthPath;
  if (!healthPath.startsWith("/") || healthPath.startsWith("//") || healthPath.includes("://")) {
    throw new Error(`${prefix}_HEALTH_PATH must be a relative path starting with /`);
  }
  return {
    name,
    command: nonEmpty(process.env[`${prefix}_COMMAND`]) ?? bundled?.command,
    args: nonEmpty(process.env[`${prefix}_ARGS`])
      ? parseArgs(nonEmpty(process.env[`${prefix}_ARGS`]), prefix)
      : bundled?.args ?? [],
    cwd: nonEmpty(process.env[`${prefix}_CWD`]) ?? bundled?.cwd,
    host,
    port: portValue ? parsePort(portValue, prefix) : defaults.port,
    healthPath,
  };
}

function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate a loopback port"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function hostForUrl(host: string): string {
  return host === "::1" ? "[::1]" : host;
}

function originOf(config: ServiceConfig): string {
  return `http://${hostForUrl(config.host)}:${config.port}`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Short single-line message; errors here never contain environment or token material. */
function sanitizeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, " ").slice(0, 200);
}

/** One bounded HTTP GET against a loopback health endpoint; resolves undefined when healthy. */
function checkHealth(healthUrl: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const request = http.get(healthUrl, { timeout: HEALTH_REQUEST_TIMEOUT_MS }, (response) => {
      response.resume();
      const statusCode = response.statusCode ?? 0;
      resolve(statusCode >= 200 && statusCode < 400 ? undefined : `unexpected HTTP status ${statusCode}`);
    });
    request.once("timeout", () => {
      request.destroy();
      resolve(`no response within ${String(HEALTH_REQUEST_TIMEOUT_MS)}ms`);
    });
    request.once("error", (error) => resolve(sanitizeMessage(error)));
  });
}

/** Polls until healthy, the budget is exhausted, or `aborted` reports the process is gone. */
async function waitForHealthy(
  healthUrl: string,
  budgetMs: number,
  aborted?: () => boolean,
): Promise<string | undefined> {
  const deadline = Date.now() + budgetMs;
  let lastDetail = "no attempt completed";
  for (;;) {
    if (aborted?.()) return "process exited before passing the health check";
    const detail = await checkHealth(healthUrl);
    if (detail === undefined) return undefined;
    lastDetail = detail;
    if (Date.now() >= deadline) {
      return `health check at ${healthUrl} did not pass within ${String(budgetMs)}ms: ${lastDetail}`;
    }
    await sleep(HEALTH_DELAY_MS);
  }
}

function onceExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

/** SIGTERM first, then SIGKILL after a bounded grace period; always ends the log stream. */
async function stopService(service: RunningService): Promise<void> {
  const { child, logStream } = service;
  try {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([onceExit(child), sleep(SIGTERM_GRACE_MS)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await Promise.race([onceExit(child), sleep(SIGKILL_GRACE_MS)]);
      }
    }
  } finally {
    logStream.end();
  }
}

/**
 * Spawns and health-checks the configured loopback services. Commands are optional: when one is
 * missing the spawn is skipped with a warning and readiness is judged by probing the configured
 * health endpoint only, so readiness is never falsely reported.
 */
export class RuntimeSupervisor {
  private readonly runtimeToken = randomBytes(32).toString("hex");
  private readonly localIdentity: LocalIdentity;
  private readonly services: RunningService[] = [];

  public constructor(
    private readonly paths: AppPaths,
    private readonly bundledRuntime?: BundledRuntime,
  ) {
    this.localIdentity = loadOrCreateIdentity(paths.data);
  }

  public async start(): Promise<SupervisorStatus> {
    let backend = getServiceConfig("backend", this.bundledRuntime?.backend);
    let frontend = getServiceConfig("frontend", this.bundledRuntime?.frontend);
    if (this.bundledRuntime) {
      if (!nonEmpty(process.env.BIDEVIDENCE_DESKTOP_BACKEND_PORT)) {
        backend = { ...backend, port: await findAvailablePort() };
      }
      if (!nonEmpty(process.env.BIDEVIDENCE_DESKTOP_FRONTEND_PORT)) {
        let frontendPort = await findAvailablePort();
        if (frontendPort === backend.port) frontendPort = await findAvailablePort();
        frontend = { ...frontend, port: frontendPort };
      }
    }
    const statuses: ServiceStatus[] = [];
    for (const config of [backend, frontend]) {
      statuses.push(await this.ensureHealthy(config, backend));
    }
    const ready = statuses.every((status) => status.ready);
    // Never leave a half-started stack running when part of it failed.
    if (!ready) await this.stop();
    return {
      ready,
      frontendOrigin: originOf(frontend),
      services: statuses,
      errors: statuses.filter((status) => !status.ready).map((status) => `${status.name}: ${status.detail}`),
    };
  }

  public async stop(): Promise<void> {
    await Promise.all(this.services.splice(0).reverse().map((service) => stopService(service)));
  }

  private async ensureHealthy(
    config: ServiceConfig,
    backend: ServiceConfig,
  ): Promise<ServiceStatus> {
    const healthUrl = `${originOf(config)}${config.healthPath}`;
    if (!config.command) {
      console.warn(
        `[desktop:${config.name}] no ${envPrefix(config.name)}_COMMAND configured; spawn skipped, ` +
          `expecting an externally managed process at ${originOf(config)}`,
      );
      const failure = await waitForHealthy(healthUrl, EXTERNAL_HEALTH_BUDGET_MS);
      return {
        name: config.name,
        managed: false,
        ready: failure === undefined,
        healthUrl,
        detail: failure ?? "healthy (externally managed)",
      };
    }
    const service = this.spawnService(config, config.command, backend);
    const failure = await waitForHealthy(
      healthUrl,
      SPAWNED_HEALTH_BUDGET_MS,
      () => service.spawnError !== undefined || service.exitDetail !== undefined,
    );
    if (failure !== undefined) {
      const detail = service.spawnError ?? (service.exitDetail ? `process ${service.exitDetail}` : failure);
      await stopService(service);
      this.services.splice(this.services.indexOf(service), 1);
      return { name: config.name, managed: true, ready: false, healthUrl, detail };
    }
    return { name: config.name, managed: true, ready: true, healthUrl, detail: "healthy (spawned by the desktop host)" };
  }

  private spawnService(
    config: ServiceConfig,
    command: string,
    backend: ServiceConfig,
  ): RunningService {
    const logStream = createWriteStream(path.join(this.paths.logs, `${config.name}.log`), { flags: "a", mode: 0o600 });
    const child = spawn(command, [...config.args], {
      cwd: config.cwd ? path.resolve(config.cwd) : this.paths.runtime,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      // Token stays in the host/sidecars; the renderer only uses same-origin /api routes.
      env: {
        ...process.env,
        BIDEVIDENCE_DESKTOP_MODE: "true",
        BIDEVIDENCE_DESKTOP_TOKEN: this.runtimeToken,
        BIDEVIDENCE_APP_DATA_DIR: this.paths.data,
        BIDEVIDENCE_LOCAL_TENANT_ID: this.localIdentity.tenantId,
        BIDEVIDENCE_LOCAL_USER_ID: this.localIdentity.userId,
        ...(config.name === "backend"
          ? { BIDEVIDENCE_RUNTIME_PORT: String(config.port) }
          : {
              BIDEVIDENCE_BACKEND_URL: originOf(backend),
              ELECTRON_RUN_AS_NODE: "1",
              HOSTNAME: config.host,
              ...(this.bundledRuntime
                ? {
                    NODE_PATH: path.join(
                      this.bundledRuntime.frontend.cwd,
                      "runtime_modules",
                    ),
                  }
                : {}),
              NODE_ENV: "production",
              PORT: String(config.port),
            }),
      },
    });
    const service: RunningService = { name: config.name, child, logStream };
    child.stdout?.on("data", (chunk: Buffer) => logStream.write(chunk));
    child.stderr?.on("data", (chunk: Buffer) => logStream.write(chunk));
    child.once("error", (error) => {
      service.spawnError = `failed to spawn ${command}: ${sanitizeMessage(error)}`;
    });
    child.once("exit", (code, signal) => {
      service.exitDetail = `exited (code=${String(code)}, signal=${String(signal)})`;
    });
    this.services.push(service);
    console.log(`[desktop:${config.name}] spawned ${command} (pid ${String(child.pid ?? "unknown")}); output -> logs/${config.name}.log`);
    return service;
  }
}
