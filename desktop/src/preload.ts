import { contextBridge, ipcRenderer } from "electron";

const runtimeInfo = Object.freeze({
  platform: process.platform,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
});

// No generic invoke/send API is exposed. Renderer code gets only these two fixed actions.
const desktopApi = Object.freeze({
  runtimeInfo,
  selectImportFiles: (): Promise<string[]> => ipcRenderer.invoke("desktop:select-import-files"),
  openDataFolder: (): Promise<void> => ipcRenderer.invoke("desktop:open-data-folder"),
});

contextBridge.exposeInMainWorld("bidevidenceDesktop", desktopApi);
