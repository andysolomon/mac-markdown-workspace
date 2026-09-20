import { contextBridge, ipcRenderer } from "electron";
import type { AppApi, CloseFlushResult } from "../shared/types/ipc";
import { hostOsFromNodePlatform, platformFromOs } from "./services/hostPlatform";

const api: AppApi = {
  platform: platformFromOs(hostOsFromNodePlatform(process.platform)),
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  openFile: () => ipcRenderer.invoke("file:open"),
  readFile: (payload) => ipcRenderer.invoke("file:read", payload),
  saveFile: (payload) => ipcRenderer.invoke("file:save", payload),
  saveFileAs: (payload) => ipcRenderer.invoke("file:save-as", payload),
  setZoomLevel: (payload) => ipcRenderer.invoke("view:set-zoom", payload),
  getZoomLevel: () => ipcRenderer.invoke("view:get-zoom"),
  getSetting: (key) => ipcRenderer.invoke("settings:get", key),
  setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
  secureAvailable: () => ipcRenderer.invoke("secure:available"),
  secureGet: (key) => ipcRenderer.invoke("secure:get", key),
  secureSet: (key, value) => ipcRenderer.invoke("secure:set", key, value),
  secureDelete: (key) => ipcRenderer.invoke("secure:delete", key),
  confirmDiscard: () => ipcRenderer.invoke("dialog:confirm-discard"),
  exportTxt: (payload) => ipcRenderer.invoke("export:txt", payload),
  exportPdf: (payload) => ipcRenderer.invoke("export:pdf", payload),
  exportDocx: (payload) => ipcRenderer.invoke("export:docx", payload),
  exportHtml: (payload) => ipcRenderer.invoke("export:html", payload),
  listNotes: () => ipcRenderer.invoke("notes:list"),
  readNote: (payload) => ipcRenderer.invoke("notes:read", payload),
  createNote: (payload) => ipcRenderer.invoke("notes:create", payload),
  writeNote: (payload) => ipcRenderer.invoke("notes:write", payload),
  deleteNote: (payload) => ipcRenderer.invoke("notes:delete", payload),
  listTombstones: () => ipcRenderer.invoke("notes:tombstones:list"),
  recordTombstone: (payload) => ipcRenderer.invoke("notes:tombstones:record", payload),
  clearTombstones: (payload) => ipcRenderer.invoke("notes:tombstones:clear", payload),
  materializeTree: (payload) => ipcRenderer.invoke("tree:materialize", payload),
  onMenuAction: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on("menu:action", handler);
    return () => {
      ipcRenderer.removeListener("menu:action", handler);
    };
  },
  // Close/quit handshake (issue #27): main sends `check-dirty`, the renderer
  // flushes every pending/in-flight note save and answers with a
  // CloseFlushResult. Always answer — a thrown callback must not hang the
  // close (main also bounds the wait with a timeout).
  checkDirty: (callback) => {
    const handler = async (_event: Electron.IpcRendererEvent, requestId: number) => {
      let result: CloseFlushResult;
      try {
        result = await callback();
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      ipcRenderer.send("dirty-check-response", { requestId, result });
    };
    ipcRenderer.on("check-dirty", handler);
    return () => {
      ipcRenderer.removeListener("check-dirty", handler);
    };
  },
  // CLI / file-manager / macOS open-file (issue #25). Subscribing tells
  // main the library is ready to drain the host open-files queue.
  onHostOpenFiles: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, paths: unknown) => {
      if (!Array.isArray(paths)) return;
      const clean = paths.filter((p): p is string => typeof p === "string" && p.length > 0);
      if (clean.length === 0) return;
      callback(clean);
    };
    ipcRenderer.on("host:open-files", handler);
    ipcRenderer.send("host:renderer-ready");
    return () => {
      ipcRenderer.removeListener("host:open-files", handler);
    };
  },
};

contextBridge.exposeInMainWorld("appApi", api);
