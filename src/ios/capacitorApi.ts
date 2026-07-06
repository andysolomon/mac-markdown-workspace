import type { AppApi } from "../../shared/types/ipc";
import type { RawNote } from "../services/notesModel";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const NOTES_DIR = "notes";
const notePath = (id: string) => `${NOTES_DIR}/${id}.md`;

/** Storage location follows the persisted setting (issue #8 / W-000008):
    "icloud" -> Documents (iCloud-backed, Files-visible); "device" -> Data
    (app-private). Reads merge BOTH locations so switching never hides
    existing notes; writes go to the selected location; deletes cover both. */
function selectedDirectory(): Directory {
  return getSettings()["iosStorage"] === "device" ? Directory.Data : Directory.Documents;
}

const BOTH_DIRECTORIES: Directory[] = [Directory.Documents, Directory.Data];

async function readRawNoteFrom(directory: Directory, id: string): Promise<RawNote> {
  const [read, stat] = await Promise.all([
    Filesystem.readFile({ path: notePath(id), directory, encoding: Encoding.UTF8 }),
    Filesystem.stat({ path: notePath(id), directory }),
  ]);
  return { id, body: read.data as string, updatedAt: stat.mtime };
}

/**
 * Capacitor-native API shim for iOS (WKWebView).
 * Uses <input type="file"> for open, @capacitor/filesystem for read/write,
 * and @capacitor/share for export.
 */

let currentFilePath: string | null = null;

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

async function writeAndShare(filename: string, data: string | Blob): Promise<boolean> {
  try {
    let base64Data: string;
    if (typeof data === "string") {
      // Write text file directly
      await Filesystem.writeFile({
        path: filename,
        data,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
    } else {
      // Convert blob to base64
      const buffer = await data.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64Data = btoa(binary);
      await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });
    }

    const uriResult = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });

    await Share.share({
      title: filename,
      url: uriResult.uri,
    });
    return true;
  } catch {
    return false;
  }
}

export const capacitorApi: AppApi = {
  getVersion: async () => "1.0.0-ios",

  openFile: async () => {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".md,.markdown,.mdx,.txt";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const content = await file.text();
        currentFilePath = file.name;
        resolve({ filePath: file.name, content });
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  },

  readFile: async (payload) => {
    try {
      const result = await Filesystem.readFile({
        path: payload.filePath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      return { filePath: payload.filePath, content: result.data as string };
    } catch {
      return { filePath: payload.filePath, content: "" };
    }
  },

  saveFile: async (payload) => {
    try {
      await Filesystem.writeFile({
        path: payload.filePath,
        data: payload.content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      currentFilePath = payload.filePath;
      return { filePath: payload.filePath };
    } catch {
      // Fall through to saveAs
      const result = await capacitorApi.saveFileAs({
        content: payload.content,
        defaultPath: payload.filePath,
      });
      return result ?? { filePath: payload.filePath };
    }
  },

  saveFileAs: async (payload) => {
    const filename = payload.defaultPath || "document.md";
    try {
      await Filesystem.writeFile({
        path: filename,
        data: payload.content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      currentFilePath = filename;

      // Offer to share/export the file
      const uriResult = await Filesystem.getUri({
        path: filename,
        directory: Directory.Documents,
      });
      await Share.share({ title: filename, url: uriResult.uri });

      return { filePath: filename };
    } catch {
      return null;
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

  onMenuAction: () => () => {
    /* no-op on iOS */
  },

  confirmDiscard: async () => {
    const result = window.confirm("You have unsaved changes. Discard them?");
    return result ? "discard" : "cancel";
  },

  exportTxt: async (payload) => {
    return writeAndShare("document.txt", payload.content);
  },

  exportPdf: async () => {
    window.print();
    return true;
  },

  exportHtml: async (payload) => {
    return writeAndShare("document.html", payload.html);
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
      return writeAndShare("document.docx", blob);
    } catch {
      return false;
    }
  },

  checkDirty: () => () => {
    /* no-op */
  },

  listNotes: async () => {
    // Merge both storage locations, newest copy of an id wins (see
    // selectedDirectory for why both are read).
    const byId = new Map<string, RawNote>();
    for (const directory of BOTH_DIRECTORIES) {
      try {
        const res = await Filesystem.readdir({ path: NOTES_DIR, directory });
        for (const entry of res.files) {
          const name = typeof entry === "string" ? entry : entry.name;
          if (!name.endsWith(".md")) continue;
          try {
            const note = await readRawNoteFrom(directory, name.slice(0, -3));
            const existing = byId.get(note.id);
            if (!existing || note.updatedAt > existing.updatedAt) byId.set(note.id, note);
          } catch {
            /* skip unreadable */
          }
        }
      } catch {
        /* directory not created yet */
      }
    }
    return [...byId.values()];
  },

  readNote: async ({ id }) => {
    for (const directory of [selectedDirectory(), ...BOTH_DIRECTORIES]) {
      try {
        return await readRawNoteFrom(directory, id);
      } catch {
        /* try next location */
      }
    }
    return null;
  },

  createNote: async ({ body }) => {
    const id = crypto.randomUUID();
    await Filesystem.writeFile({
      path: notePath(id),
      data: body ?? "",
      directory: selectedDirectory(),
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return { id, body: body ?? "", updatedAt: Date.now() };
  },

  writeNote: async ({ id, body }) => {
    await Filesystem.writeFile({
      path: notePath(id),
      data: body,
      directory: selectedDirectory(),
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return { id, body, updatedAt: Date.now() };
  },

  deleteNote: async ({ id }) => {
    // Remove from every location so stale copies can't resurface in the merge.
    for (const directory of BOTH_DIRECTORIES) {
      try {
        await Filesystem.deleteFile({ path: notePath(id), directory });
      } catch {
        /* not present there */
      }
    }
  },
};
