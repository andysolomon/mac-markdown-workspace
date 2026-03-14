import type { AppApi } from "../../shared/types/ipc";

/**
 * Browser-compatible shim for the Electron appApi.
 * Uses File System Access API, localStorage, and download links.
 */

let fileHandle: FileSystemFileHandle | null = null;

function getSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem("mmw-settings") || "{}");
  } catch {
    return {};
  }
}

function setSettings(settings: Record<string, unknown>) {
  localStorage.setItem("mmw-settings", JSON.stringify(settings));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const browserApi: AppApi = {
  getVersion: async () => "1.0.0-web",

  openFile: async () => {
    if (!("showOpenFilePicker" in window)) {
      // Fallback: use file input
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".md,.markdown,.mdx,.txt";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) { resolve(null); return; }
          const content = await file.text();
          fileHandle = null; // No handle in fallback
          resolve({ filePath: file.name, content });
        };
        input.oncancel = () => resolve(null);
        input.click();
      });
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Markdown files",
            accept: { "text/markdown": [".md", ".markdown", ".mdx"], "text/plain": [".txt"] },
          },
        ],
      });
      fileHandle = handle;
      const file = await handle.getFile();
      const content = await file.text();
      return { filePath: file.name, content };
    } catch {
      return null; // User cancelled
    }
  },

  readFile: async (payload) => {
    // In the browser, drag-and-drop reads directly via File API
    // This is handled in App.tsx's drop handler instead
    return { filePath: payload.filePath, content: "" };
  },

  saveFile: async (payload) => {
    if (fileHandle) {
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(payload.content);
        await writable.close();
        return { filePath: payload.filePath };
      } catch {
        // Permission denied or handle stale, fall through to saveAs
      }
    }
    // No handle — trigger save-as
    const result = await browserApi.saveFileAs({ content: payload.content, defaultPath: payload.filePath });
    return result ?? { filePath: payload.filePath };
  },

  saveFileAs: async (payload) => {
    if (!("showSaveFilePicker" in window)) {
      // Fallback: download
      const blob = new Blob([payload.content], { type: "text/markdown" });
      downloadBlob(blob, payload.defaultPath || "document.md");
      return { filePath: payload.defaultPath || "document.md" };
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: payload.defaultPath || "document.md",
        types: [
          { description: "Markdown", accept: { "text/markdown": [".md"] } },
          { description: "Text", accept: { "text/plain": [".txt"] } },
        ],
      });
      fileHandle = handle;
      const writable = await handle.createWritable();
      await writable.write(payload.content);
      await writable.close();
      return { filePath: handle.name };
    } catch {
      return null; // User cancelled
    }
  },

  setZoomLevel: async () => null,
  getZoomLevel: async () => ({ level: 0 }),

  getSetting: async (key) => getSettings()[key],

  setSetting: async (key, value) => {
    const settings = getSettings();
    settings[key] = value;
    setSettings(settings);
  },

  onMenuAction: () => () => { /* no-op in browser */ },

  confirmDiscard: async () => {
    const result = window.confirm("You have unsaved changes. Discard them?");
    return result ? "discard" : "cancel";
  },

  exportTxt: async (payload) => {
    const blob = new Blob([payload.content], { type: "text/plain" });
    downloadBlob(blob, "document.txt");
    return true;
  },

  exportPdf: async () => {
    window.print();
    return true;
  },

  exportDocx: async (payload) => {
    try {
      const htmlToDocx = (await import("html-to-docx")).default;
      const buffer = await htmlToDocx(payload.html, null, {
        table: { row: { cantSplit: true } },
      });
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      downloadBlob(blob, "document.docx");
      return true;
    } catch {
      return false;
    }
  },

  checkDirty: () => () => { /* no-op */ },
};
