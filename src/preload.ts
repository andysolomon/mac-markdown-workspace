import { contextBridge, ipcRenderer } from "electron";
import type {
  AppApi,
  OpenFileResult,
  SaveAsFileResult,
  SaveFileResult,
} from "../shared/types/ipc";

const api: AppApi = {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  openFile: () => ipcRenderer.invoke("file:open") as Promise<OpenFileResult>,
  saveFile: (payload) => ipcRenderer.invoke("file:save", payload) as Promise<SaveFileResult>,
  saveFileAs: (payload) =>
    ipcRenderer.invoke("file:save-as", payload) as Promise<SaveAsFileResult>,
  setZoomLevel: (payload) => ipcRenderer.invoke("view:set-zoom", payload),
  getZoomLevel: () => ipcRenderer.invoke("view:get-zoom"),
};

contextBridge.exposeInMainWorld("appApi", api);
