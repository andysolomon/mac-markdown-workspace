/**
 * Note autosave glue (issue #27) — binds the save coordinator to the notes
 * library and the editing buffer. NotesShell drives it; tests exercise it
 * directly against the stores.
 *
 * Invariants:
 *  - A write always targets the note id it was scheduled for.
 *  - The buffer is marked clean only for the exact body that persisted, and
 *    only while that note is still the active one — a stale completion can't
 *    hide newer, unsaved edits.
 *  - Failed writes are retained; the user retries or explicitly discards.
 */

import type { CloseFlushResult } from "../../shared/types/ipc";
import { useDocumentStore } from "./documentStore";
import { useNotesStore } from "./notesStore";
import {
  createSaveCoordinator,
  DEFAULT_AUTOSAVE_MS,
  describeError,
  type PendingSave,
} from "./saveCoordinator";

export const AUTOSAVE_MS = DEFAULT_AUTOSAVE_MS;

export const noteSaves = createSaveCoordinator({
  debounceMs: AUTOSAVE_MS,
  write: async (noteId, body) => {
    await useNotesStore.getState().updateNote(noteId, body);
  },
  onSaved: (save) => {
    // Revision-safe clean marking: record the persisted body as the saved
    // baseline for the still-active note. If newer edits exist, content !==
    // savedContent and the buffer stays "Modified" until they persist too.
    if (useNotesStore.getState().activeNoteId === save.noteId) {
      useDocumentStore.setState({ savedContent: save.body });
    }
  },
});

/** Reconcile the editing buffer with the coordinator: schedule a save when
    the buffer differs from the persisted body (or a write is in flight and
    might be superseded), cancel when it matches disk again. */
export function syncBufferToAutosave(): void {
  const s = useNotesStore.getState();
  if (!s.loaded || !s.activeNoteId) return;
  const active = s.notes.find((n) => n.id === s.activeNoteId);
  if (!active) return;
  const content = useDocumentStore.getState().content;
  if (content === active.body && !noteSaves.isInFlight(active.id)) {
    noteSaves.cancel(active.id);
    return;
  }
  const unsaved = noteSaves.getUnsavedBody(active.id);
  if (unsaved === content && !noteSaves.getState().failed.has(active.id)) return;
  noteSaves.schedule(active.id, content);
}

/** Write every pending edit now (buffer included) and await in-flight work.
    Used before switching notes and by the host's close handshake. */
export async function flushNoteSaves(): Promise<CloseFlushResult> {
  syncBufferToAutosave();
  const result = await noteSaves.flush();
  try {
    // Save and settings flows can start a notes-store write without going
    // through this coordinator. Close must wait for those too.
    await useNotesStore.getState().waitForWrites();
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
  return result;
}

/** Load a note into the buffer on selection. An unpersisted body (pending,
    in-flight, or failed) for that note takes precedence over the stored
    one, so edits survive switching away and back; the saved baseline stays
    the persisted body so the buffer reads as "Modified". */
export function loadNoteIntoBuffer(noteId: string): void {
  const note = useNotesStore.getState().notes.find((n) => n.id === noteId);
  if (!note) return;
  const unsaved = noteSaves.getUnsavedBody(noteId);
  useDocumentStore.setState({
    content: unsaved ?? note.body,
    savedContent: note.body,
    filePath: "",
  });
}

/**
 * Apply a library refresh to the editor only when the active buffer is clean.
 * Sync flushes local edits first, but this guard also protects callers that
 * reload the library for another reason from clobbering unsaved text.
 */
export function reconcileActiveNoteBuffer(): void {
  const notes = useNotesStore.getState();
  const id = notes.activeNoteId;
  if (!id) return;
  const note = notes.notes.find((entry) => entry.id === id);
  if (!note) return;
  if (noteSaves.getUnsavedBody(id) !== null) return;

  const document = useDocumentStore.getState();
  if (document.content !== document.savedContent) return;
  if (document.content === note.body && document.savedContent === note.body) return;
  loadNoteIntoBuffer(id);
}

export function retryFailedSaves(): Promise<CloseFlushResult> {
  return noteSaves.retry();
}

/** Explicit user discard of failed saves. The active note's buffer reverts
    to its last persisted body so the editor and disk agree. */
export function discardFailedSaves(): PendingSave[] {
  const dropped = noteSaves.discardFailed();
  const s = useNotesStore.getState();
  if (s.activeNoteId && dropped.some((d) => d.noteId === s.activeNoteId)) {
    const note = s.notes.find((n) => n.id === s.activeNoteId);
    if (note) useDocumentStore.setState({ content: note.body, savedContent: note.body });
  }
  return dropped;
}
