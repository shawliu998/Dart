import path from "node:path";
import { dialog, ipcMain, shell } from "electron";

import type { AppPaths } from "./paths";

const IMPORT_EXTENSIONS = new Set([".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt"]);

function isImportFile(filePath: string): boolean {
  return IMPORT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** IPC errors cross into the renderer: keep them short plain strings, free of environment or secret material. */
function safeError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  return new Error(raw.replace(/\s+/g, " ").slice(0, 200));
}

/** Registers the complete, deliberately small renderer-to-main IPC surface. */
export function registerIpcHandlers(paths: AppPaths): void {
  ipcMain.handle("desktop:select-import-files", async (): Promise<string[]> => {
    try {
      const result = await dialog.showOpenDialog({
        title: "选择导入文件",
        defaultPath: paths.imports,
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "支持的文件", extensions: ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt"] }],
      });
      if (result.canceled) return [];
      // The dialog filter is a hint only; the main process re-validates every returned path.
      return result.filePaths.filter(isImportFile).map((filePath) => path.resolve(filePath));
    } catch (error) {
      throw safeError(error);
    }
  });

  ipcMain.handle("desktop:open-data-folder", async (): Promise<void> => {
    try {
      // The renderer passes no path: only the host-owned data directory can be opened.
      const failure = await shell.openPath(paths.data);
      if (failure) throw new Error(failure);
    } catch (error) {
      throw safeError(error);
    }
  });
}
