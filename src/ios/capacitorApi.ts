import type { AppApi } from "../../shared/types/ipc";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  IOS_STORAGE_KEY,
  createNotesStorageController,
  deleteNoteFrom,
  isIosStorage,
  listNotesIn,
  otherStorage,
  readMetaLenient,
  readNoteFrom,
  tombstonesOf,
  writeMetaTo,
  writeNoteTo,
  type PreferenceStore,
} from "./notesStorage";

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

/**
 * Notes-library storage location (issue #8 / W-000008). The controller owns
 * the Documents-vs-LibraryNoCloud choice, legacy-value normalization, and
 * migration; every notes operation below runs through `withActive` so a
 * migration can never interleave with a note write, scaffold, or sync pull.
 * The preference itself rides on the same localStorage settings blob as every
 * other AppApi setting.
 */
const preferenceStore: PreferenceStore = {
  get: (key) => getSettings()[key],
  set: (key, value) => {
    const settings = getSettings();
    settings[key] = value;
    setSettings(settings);
  },
  setMany: (values) => {
    const settings = getSettings();
    Object.assign(settings, values);
    // One localStorage write is the activation commit: iosStorage and its
    // cleanup marker can never be persisted in different settings snapshots.
    setSettings(settings);
  },
  remove: (key) => {
    const settings = getSettings();
    delete settings[key];
    setSettings(settings);
  },
};
const notesStorage = createNotesStorageController(preferenceStore);

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
  platform: { os: "ios", commandUsesCtrl: true, showWindowDots: false },
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

  getSetting: async (key) => {
    // The storage location is answered by the controller so callers only ever
    // see a canonical value that matches the root notes are being served from.
    if (key === IOS_STORAGE_KEY) return notesStorage.current();
    return getSettings()[key];
  },

  setSetting: async (key, value) => {
    if (key === IOS_STORAGE_KEY) {
      // Transactional: copies + verifies the library in the new root, atomically
      // persists the preference + cleanup marker, then removes the old copy.
      // Rejects (leaving the old location active) on any pre-activation
      // failure. Cleanup after activation is best-effort and does not reject.
      if (!isIosStorage(value)) throw new Error(`Invalid iOS storage location: ${String(value)}`);
      await notesStorage.setStorage(value);
      return;
    }
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

  // Notes library — every operation reads/writes ONLY the active root
  // (Documents or Library/NoCloud per the storage setting) and is serialized
  // with migration by the controller.
  listNotes: () => notesStorage.withActive((directory) => listNotesIn(directory)),

  readNote: ({ id }) =>
    notesStorage.withActive(async (directory) => {
      try {
        const note = await readNoteFrom(directory, id);
        const { times } = await readMetaLenient(directory);
        const canonical = times[id];
        if (canonical !== undefined) note.updatedAt = canonical;
        return note;
      } catch {
        return null;
      }
    }),

  createNote: ({ body }) =>
    notesStorage.withActive(async (directory) => {
      const id = crypto.randomUUID();
      const updatedAt = Date.now();
      await writeNoteTo(directory, id, body ?? "");
      const meta = await readMetaLenient(directory);
      meta.times[id] = updatedAt;
      await writeMetaTo(directory, meta);
      return { id, body: body ?? "", updatedAt };
    }),

  writeNote: ({ id, body, updatedAt }) =>
    notesStorage.withActive(async (directory) => {
      const stamp = updatedAt ?? Date.now();
      await writeNoteTo(directory, id, body);
      const meta = await readMetaLenient(directory);
      meta.times[id] = stamp;
      delete meta.tombstones[id]; // resurrected note: drop any stale tombstone
      await writeMetaTo(directory, meta);
      return { id, body, updatedAt: stamp };
    }),

  deleteNote: ({ id }) =>
    notesStorage.withActive(async (directory) => {
      await deleteNoteFrom(directory, id);
      // Defensive: also drop any leftover copy in the inactive root (e.g. from
      // an interrupted cleanup) so it can never come back after a later switch.
      const inactive = otherStorage(await notesStorage.current());
      try {
        await deleteNoteFrom(
          inactive === "private" ? Directory.LibraryNoCloud : Directory.Documents,
          id,
        );
      } catch {
        /* best effort */
      }
      const meta = await readMetaLenient(directory);
      delete meta.times[id];
      await writeMetaTo(directory, meta);
    }),

  listTombstones: () =>
    notesStorage.withActive(async (directory) => tombstonesOf(await readMetaLenient(directory))),

  recordTombstone: ({ id, deletedAt }) =>
    notesStorage.withActive(async (directory) => {
      const meta = await readMetaLenient(directory);
      meta.tombstones[id] = deletedAt;
      delete meta.times[id];
      await writeMetaTo(directory, meta);
    }),

  clearTombstones: ({ ids }) =>
    notesStorage.withActive(async (directory) => {
      const meta = await readMetaLenient(directory);
      for (const id of ids) delete meta.tombstones[id];
      await writeMetaTo(directory, meta);
    }),

  // Scaffolds land beside the notes library in the active root.
  materializeTree: ({ entries }) => notesStorage.withActive(async (directory) => {
    const scaffoldRoot = `scaffolds/${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const sorted = [...entries].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      const depthA = a.relativePath.split("/").length;
      const depthB = b.relativePath.split("/").length;
      return depthA - depthB || a.relativePath.localeCompare(b.relativePath);
    });

    try {
      for (const entry of sorted) {
        const segments = entry.relativePath.split("/").filter(Boolean);
        if (segments.length === 0) continue;
        if (segments.some((seg) => seg === ".." || seg === ".")) {
          return { ok: false, error: "Invalid path in tree" };
        }

        const relativePath =
          entry.kind === "dir"
            ? `${scaffoldRoot}/${segments.join("/")}`
            : `${scaffoldRoot}/${segments.join("/")}`;

        if (entry.kind === "dir") {
          await Filesystem.mkdir({
            path: relativePath,
            directory,
            recursive: true,
          });
          continue;
        }

        try {
          await Filesystem.stat({ path: relativePath, directory });
        } catch {
          await Filesystem.writeFile({
            path: relativePath,
            data: "",
            directory,
            encoding: Encoding.UTF8,
            recursive: true,
          });
        }
      }
      return { ok: true, rootPath: scaffoldRoot };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Scaffold failed",
      };
    }
  }),
};
