import { mkdirSync } from "node:fs";
import path from "node:path";

/** Typed layout of every directory the desktop host owns under Electron's userData path. */
export interface AppPaths {
  readonly root: string;
  readonly data: string;
  readonly imports: string;
  readonly logs: string;
  readonly runtime: string;
}

/** Creates the desktop-owned directories under Electron's userData path and returns the frozen layout. */
export function ensureAppPaths(userDataPath: string): AppPaths {
  const root = path.resolve(userDataPath);
  const layout: AppPaths = {
    root,
    data: path.join(root, "data"),
    imports: path.join(root, "imports"),
    logs: path.join(root, "logs"),
    runtime: path.join(root, "runtime"),
  };
  for (const directory of Object.values(layout)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  return Object.freeze(layout);
}
