# BidEvidence Desktop Host

Electron shell for the local BidEvidence (标证通) stack. This directory owns only the desktop boundary: single-instance window management, a minimal frozen preload API, loopback service supervision, and two IPC actions. The FastAPI backend, Next.js frontend, data model, and product workflows remain owned by the root project.

> **Warning — dependencies:** Electron, TypeScript, and the Node typings are **not** installed by the root setup. You must run `npm install` inside this `desktop/` directory before any other command.

> **Warning — integration configuration:** the `BIDEVIDENCE_DESKTOP_*` command variables below are integration configuration, not working wiring. The root project does not yet provide desktop entry points, so today the realistic mode is: start the stack yourself (e.g. `make dev` in the repo root), leave the commands empty, and the host attaches to the already-running services. If health checks fail, the window shows an error page instead of the app.

## Install and run

```sh
cd desktop
npm install        # required; installs electron, typescript, @types/node
npm run typecheck  # strict TS check, no emit
npm run build      # compile src/ -> dist/
npm start          # build + launch Electron
npm run dev        # like start, plus detached DevTools (POSIX shells)
```

There is deliberately no packaging script. A signed/notarized distributable belongs to a later milestone, after the root project has a production Next standalone build and a release policy.

## Service configuration (environment variables)

The supervisor reads `BIDEVIDENCE_DESKTOP_<BACKEND|FRONTEND>_*` variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `..._COMMAND` | _(empty)_ | Executable to spawn. **Optional**: when empty, spawning is skipped with a warning and the host expects an externally managed process at the configured origin. |
| `..._ARGS` | `[]` | JSON string array of arguments, e.g. `'["-m","uvicorn","app.main:app"]'`. Parsed, never shell-interpolated. |
| `..._CWD` | `userData/runtime` | Working directory of the spawned process. |
| `..._HOST` | `127.0.0.1` | Must be loopback: `127.0.0.1`, `::1`, or `localhost`. Anything else fails startup. |
| `..._PORT` | `8000` / `3000` | Expected port, integer 1–65535. |
| `..._HEALTH_PATH` | `/health` / `/` | Relative HTTP path polled until it answers 2xx/3xx. |

`BIDEVIDENCE_DESKTOP_DEVTOOLS=1` opens detached DevTools at launch (used by `npm run dev`).

Readiness is reported only when **every** service passes its health check (spawned processes get a 60 s budget, externally managed ones 10 s). The frontend URL is loaded only after full readiness; otherwise the window shows a failure page listing which service failed and why. Readiness is never claimed on configuration or health failure.

Example (integration configuration — not wired by the root project today):

```sh
BIDEVIDENCE_DESKTOP_BACKEND_COMMAND=.venv/bin/python \
BIDEVIDENCE_DESKTOP_BACKEND_ARGS='["-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000"]' \
BIDEVIDENCE_DESKTOP_BACKEND_CWD=../backend \
BIDEVIDENCE_DESKTOP_FRONTEND_COMMAND=node \
BIDEVIDENCE_DESKTOP_FRONTEND_ARGS='["server.js"]' \
BIDEVIDENCE_DESKTOP_FRONTEND_CWD=../frontend/.next/standalone \
npm start
```

### Runtime token

Each launch generates `crypto.randomBytes(32)` and passes it to spawned children only via the environment variable `BIDEVIDENCE_RUNTIME_TOKEN`. It is never printed, logged, or exposed to the renderer. The root backend does not yet require or verify this token — that is outstanding integration work.

## Security properties

- Single instance: a second launch focuses the existing window instead of starting a new one.
- Renderer runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`; every renderer permission request is denied.
- In-window navigation (including redirects) is limited to the configured loopback frontend origin; `window.open` is always denied; well-formed external `http(s)` links open via `shell.openExternal`; `<webview>` attachment is blocked.
- Preload exposes exactly one frozen object, `window.bidevidenceDesktop`: frozen `runtimeInfo` plus `selectImportFiles()` and `openDataFolder()`. No generic IPC, no `ipcRenderer`, no Node or shell access.
- IPC surface is exactly two `ipcMain.handle` channels: `desktop:select-import-files` (picker restricted to pdf/docx/doc/xlsx/xls/pptx/ppt, re-validated in the main process) and `desktop:open-data-folder` (takes no path; opens only the app-owned `userData/data`). IPC errors are short plain strings without environment or secret material.
- Children spawn with `shell: false`, loopback-only hosts, bounded health checks, and SIGTERM → SIGKILL (5 s grace) shutdown. Child stdout/stderr goes to `userData/logs/<service>.log`.
- Desktop-owned directories under Electron `userData`: `data/`, `imports/`, `logs/`, `runtime/`.

## Outstanding integration with the root project

- The backend has no desktop entry point and does not authenticate `BIDEVIDENCE_RUNTIME_TOKEN`; the frontend has no production standalone server configured and does not yet consume `window.bidevidenceDesktop`.
- `selectImportFiles` returns validated paths only; importing them into the backend is not connected.
- Packaging, signing, and auto-update are intentionally absent; root CI does not build this directory.
