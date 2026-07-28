# BidEvidence Desktop

The Electron host packages the existing BidEvidence product as a local macOS app.
It owns the native window, app data directories, loopback service lifecycle and
two narrow native actions. Product workflows remain in the existing Next.js and
FastAPI codebases.

## Install the unsigned macOS build

The current release target is Apple Silicon:

1. Open `BidEvidence-0.2.0-arm64.dmg`.
2. Drag `BidEvidence.app` to `Applications`.
3. Open the app. Because the development build is unsigned, macOS may require
   **Control-click → Open** on first launch.
4. Use the built-in Mock provider offline, or open **Settings → Model connection**
   to test and save a DeepSeek API connection.

The app includes its FastAPI and Next.js runtimes. End users do not need Docker,
Python or Node. Workspace data and logs live under Electron's app-owned user data
directory; **Open data folder** reveals that location from the desktop menu.

## Build and verify

From the repository root:

```sh
cd backend && .venv/bin/pip install -r requirements-dev.txt
cd ../desktop && npm install
cd ..

make desktop-package
make desktop-smoke
```

`make desktop-package` builds the Next standalone server, freezes the current
FastAPI app with PyInstaller, compiles the Electron host, then writes an unsigned
DMG and ZIP to `desktop/release/`.

`make desktop-smoke` mounts the DMG, copies the app to a temporary Applications
directory, detaches the image, then launches with a clean user data directory and
`PATH=/usr/bin:/bin`. It verifies both health endpoints, workspace model settings,
project creation, clean sidecar shutdown and a same-data restart. This is the
release gate for the downloadable package.

For desktop development:

```sh
make desktop-dev
make desktop-test
```

## Runtime architecture

At packaged startup the host:

1. creates or restores the local workspace identity;
2. reserves two loopback ports;
3. starts the frozen FastAPI executable;
4. starts the bundled Next standalone server with Electron's embedded Node runtime;
5. waits for both services to report healthy before loading the product window.

If a service cannot start, the native window shows the failed service and its log
location instead of claiming that the app is ready. Child output is written to
`userData/logs/backend.log` and `userData/logs/frontend.log`.

The development host still accepts
`BIDEVIDENCE_DESKTOP_<BACKEND|FRONTEND>_{COMMAND,ARGS,CWD,HOST,PORT,HEALTH_PATH}`
overrides. Commands are spawned directly with `shell: false`; hosts must remain on
loopback.

## Native boundary

- The renderer uses `nodeIntegration: false`, `contextIsolation: true` and the
  Chromium sandbox.
- Navigation stays on the selected loopback frontend origin.
- Preload exposes only `selectImportFiles()` and `openDataFolder()`.
- Each launch passes a random desktop token and stable local tenant/user identity
  to the bundled backend without exposing them to the renderer.
- App-owned directories are `data/`, `imports/`, `logs/` and `runtime/`.

## Release boundary

Version 0.2.0 produces unsigned macOS arm64 artifacts. Code signing, notarization,
automatic updates, Intel macOS and Windows installers are separate release work.
