import type { AppApi, NoteTombstone } from "../../shared/types/ipc";
import type { RawNote } from "../services/notesModel";

/**
 * Browser-compatible shim for the Electron appApi.
 * Uses File System Access API for open/save, localStorage for settings,
 * download links for export, and IndexedDB for the notes library. (Safari
 * lacks persistent directory handles, so the library lives in IndexedDB — a
 * File System Access "real folder" backing can be layered on for Chrome/Edge.)
 */

let fileHandle: FileSystemFileHandle | null = null;

// --- IndexedDB-backed notes library ---
const NOTES_DB = "mmw-notes";
const NOTES_STORE = "notes";
const TOMBSTONE_STORE = "tombstones"; // { id, deletedAt } — vault-sync bookkeeping
let notesDbPromise: Promise<IDBDatabase> | null = null;

function openNotesDb(): Promise<IDBDatabase> {
  if (!notesDbPromise) {
    notesDbPromise = new Promise((resolve, reject) => {
      // v2 adds the tombstone store; guards make the upgrade idempotent
      // regardless of the version the client is coming from.
      const req = indexedDB.open(NOTES_DB, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(NOTES_STORE))
          db.createObjectStore(NOTES_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(TOMBSTONE_STORE))
          db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return notesDbPromise;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function notesStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openNotesDb();
  return db.transaction(NOTES_STORE, mode).objectStore(NOTES_STORE);
}

async function tombstoneStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openNotesDb();
  return db.transaction(TOMBSTONE_STORE, mode).objectStore(TOMBSTONE_STORE);
}

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
  // iOS Safari needs the anchor in the DOM, and processes the download
  // asynchronously — revoking the URL synchronously aborts it (issue #12).
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Deliver an exported file: native share sheet on touch devices (the only
    reliable path on iOS Safari), download anchor elsewhere. */
async function deliverFile(blob: Blob, filename: string, mime: string): Promise<boolean> {
  const isTouch = navigator.maxTouchPoints > 1;
  if (isTouch && typeof navigator.canShare === "function") {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return true;
      } catch (err) {
        // User cancelled the sheet — that's a completed interaction.
        if ((err as DOMException)?.name === "AbortError") return true;
        // Otherwise fall through to the download path.
      }
    }
  }
  downloadBlob(blob, filename);
  return true;
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
    return deliverFile(blob, "document.txt", "text/plain");
  },

  // payload.html is a complete standalone document; print it in a hidden
  // frame so only the note — not the app chrome — reaches the PDF (issue #3).
  exportPdf: async (payload) => {
    const { printStandaloneHtml } = await import("../services/exportHtml");
    return printStandaloneHtml(payload.html);
  },

  exportHtml: async (payload) => {
    const blob = new Blob([payload.html], { type: "text/html" });
    return deliverFile(blob, "document.html", "text/html");
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
      return deliverFile(
        blob,
        "document.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    } catch {
      return false;
    }
  },

  checkDirty: () => () => { /* no-op */ },

  listNotes: async () => {
    const store = await notesStore("readonly");
    return (await idbRequest(store.getAll())) as RawNote[];
  },

  readNote: async ({ id }) => {
    const store = await notesStore("readonly");
    return ((await idbRequest(store.get(id))) as RawNote | undefined) ?? null;
  },

  createNote: async ({ body }) => {
    const note: RawNote = { id: crypto.randomUUID(), body: body ?? "", updatedAt: Date.now() };
    const store = await notesStore("readwrite");
    await idbRequest(store.put(note));
    return note;
  },

  writeNote: async ({ id, body, updatedAt }) => {
    const note: RawNote = { id, body, updatedAt: updatedAt ?? Date.now() };
    // Write the note AND drop any tombstone for this id in one transaction —
    // a resurrected note must not carry a stale deletion that re-propagates.
    const db = await openNotesDb();
    const tx = db.transaction([NOTES_STORE, TOMBSTONE_STORE], "readwrite");
    await Promise.all([
      idbRequest(tx.objectStore(NOTES_STORE).put(note)),
      idbRequest(tx.objectStore(TOMBSTONE_STORE).delete(id)),
    ]);
    return note;
  },

  deleteNote: async ({ id }) => {
    const store = await notesStore("readwrite");
    await idbRequest(store.delete(id));
  },

  listTombstones: async () => {
    const store = await tombstoneStore("readonly");
    return (await idbRequest(store.getAll())) as NoteTombstone[];
  },

  recordTombstone: async ({ id, deletedAt }) => {
    const store = await tombstoneStore("readwrite");
    await idbRequest(store.put({ id, deletedAt }));
  },

  clearTombstones: async ({ ids }) => {
    const store = await tombstoneStore("readwrite");
    await Promise.all(ids.map((id) => idbRequest(store.delete(id))));
  },
};
