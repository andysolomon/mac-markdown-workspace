import type { RawNote } from "../../src/services/notesModel";

export type OpenFileResult =
  | {
      filePath: string;
      content: string;
    }
  | null;

export type SaveFileResult = { filePath: string };
export type SaveAsFileResult = { filePath: string } | null;

export type ConfirmDiscardResult = "save" | "discard" | "cancel";

/** A recorded local deletion awaiting vault sync (id + when deleted).
    Structurally the sync engine's VaultTombstone; kept inline here so the
    shared IPC contract doesn't depend on the sync service. */
export type NoteTombstone = { id: string; deletedAt: number };

export type AppApi = {
  getVersion: () => Promise<string>;
  openFile: () => Promise<OpenFileResult>;
  readFile: (payload: { filePath: string }) => Promise<OpenFileResult>;
  saveFile: (payload: { filePath: string; content: string }) => Promise<SaveFileResult>;
  saveFileAs: (payload: { content: string; defaultPath?: string }) => Promise<SaveAsFileResult>;
  setZoomLevel: (payload: { level: number }) => Promise<{ level: number } | null>;
  getZoomLevel: () => Promise<{ level: number }>;
  getSetting: (key: string) => Promise<unknown>;
  setSetting: (key: string, value: unknown) => Promise<void>;
  onMenuAction: (callback: (action: string) => void) => () => void;
  confirmDiscard: () => Promise<ConfirmDiscardResult>;
  exportTxt: (payload: { content: string }) => Promise<boolean>;
  /** `html` is a complete standalone document (built by the renderer). */
  exportPdf: (payload: { html: string }) => Promise<boolean>;
  /** `html` is a rendered fragment (converted by html-to-docx). */
  exportDocx: (payload: { html: string }) => Promise<boolean>;
  /** `html` is a complete standalone document (built by the renderer). */
  exportHtml: (payload: { html: string }) => Promise<boolean>;
  checkDirty: (callback: () => Promise<boolean>) => () => void;

  // Notes library — each note is a markdown file/record keyed by a stable id.
  listNotes: () => Promise<RawNote[]>;
  readNote: (payload: { id: string }) => Promise<RawNote | null>;
  createNote: (payload: { body: string }) => Promise<RawNote>;
  /** `updatedAt` is preserved verbatim when supplied (vault sync pulls a note
      with its canonical timestamp); omitted for local edits, which stamp now. */
  writeNote: (payload: { id: string; body: string; updatedAt?: number }) => Promise<RawNote>;
  deleteNote: (payload: { id: string }) => Promise<void>;

  // Vault-sync deletion bookkeeping — a local delete records a tombstone so it
  // can propagate to other devices instead of the note resurrecting on pull.
  listTombstones: () => Promise<NoteTombstone[]>;
  recordTombstone: (payload: { id: string; deletedAt: number }) => Promise<void>;
  clearTombstones: (payload: { ids: string[] }) => Promise<void>;
};
