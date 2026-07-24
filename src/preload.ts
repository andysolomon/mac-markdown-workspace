import { contextBridge, ipcRenderer } from "electron";
import type { AppApi } from "../shared/types/ipc";

const api: AppApi = {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  openFile: () => ipcRenderer.invoke("file:open"),
  readFile: (payload) => ipcRenderer.invoke("file:read", payload),
  saveFile: (payload) => ipcRenderer.invoke("file:save", payload),
  saveFileAs: (payload) => ipcRenderer.invoke("file:save-as", payload),
  setZoomLevel: (payload) => ipcRenderer.invoke("view:set-zoom", payload),
  getZoomLevel: () => ipcRenderer.invoke("view:get-zoom"),
  getSetting: (key) => ipcRenderer.invoke("settings:get", key),
  setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
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
  checkDirty: (callback) => {
    const handler = async () => {
      const canClose = await callback();
      ipcRenderer.send("dirty-check-response", canClose);
    };
    ipcRenderer.on("check-dirty", handler);
    return () => {
      ipcRenderer.removeListener("check-dirty", handler);
    };
  },
};

contextBridge.exposeInMainWorld("appApi", api);
