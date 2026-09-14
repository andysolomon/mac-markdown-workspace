/**
 * Save coordinator (issue #27) — the single owner of pending and in-flight
 * note saves in the renderer.
 *
 * Every buffer edit is recorded as a `PendingSave` carrying the ORIGINAL note
 * id, the exact body, and a monotonically increasing revision. Writes are
 * serialized (one in flight at a time) and always send the newest body for a
 * note, so a slow write can never overwrite newer content. A completed write
 * reports the revision it persisted; callers mark the buffer clean only if
 * that revision is still the newest one for the note.
 *
 * Failed writes are retained (not discarded) so the user can retry or
 * explicitly discard, and `flush()` — used by the window-close handshake —
 * reports `ok: false` while anything remains unpersisted.
 *
 * Framework-free and timer-injectable so it can be tested deterministically.
 */

import type { CloseFlushResult } from "../../shared/types/ipc";

export const DEFAULT_AUTOSAVE_MS = 600;

export interface PendingSave {
  noteId: string;
  body: string;
  revision: number;
}

export type SaveStatus = "idle" | "pending" | "saving" | "error";

export interface SaveCoordinatorState {
  status: SaveStatus;
  /** Newest revision handed to `schedule()` (0 before any edit). */
  latestRevision: number;
  /** Scheduled but not yet written, keyed by note id. */
  pending: ReadonlyMap<string, PendingSave>;
  inFlight: PendingSave | null;
  /** Rejected writes awaiting retry or explicit discard, keyed by note id. */
  failed: ReadonlyMap<string, PendingSave>;
  /** Message of the most recent rejected write, or null. */
  error: string | null;
}

export interface SaveCoordinatorOptions {
  /** Persist `body` as the content of note `noteId`. Must reject on failure. */
  write: (noteId: string, body: string) => Promise<void>;
  /** Called after a write durably succeeded. `current` is true when no newer
      revision exists for that note (i.e. the buffer may be marked clean). */
  onSaved?: (save: PendingSave, current: boolean) => void;
  /** Called after a write rejected; the save stays retained for retry. */
  onFailed?: (save: PendingSave, error: string) => void;
  debounceMs?: number;
}

export interface SaveCoordinator {
  /** Record an edit of `noteId`; (re)starts the debounce. */
  schedule: (noteId: string, body: string) => PendingSave;
  /** Drop any pending or failed save for `noteId` (the buffer matches disk). */
  cancel: (noteId: string) => void;
  /** Write everything pending now and wait for in-flight work. */
  flush: () => Promise<CloseFlushResult>;
  /** Re-attempt every failed save. */
  retry: () => Promise<CloseFlushResult>;
  /** Explicitly drop failed saves. Returns what was dropped. */
  discardFailed: () => PendingSave[];
  /** Newest unpersisted body for a note (pending, in-flight, or failed). */
  getUnsavedBody: (noteId: string) => string | null;
  isInFlight: (noteId: string) => boolean;
  hasUnsaved: () => boolean;
  /** True when `revision` is the newest revision recorded for `noteId`. */
  isCurrent: (noteId: string, revision: number) => boolean;
  getState: () => SaveCoordinatorState;
  subscribe: (listener: () => void) => () => void;
  /** Test/teardown helper: clears timers and all retained work. */
  reset: () => void;
}

export function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Electron wraps rejected `ipcMain.handle` errors; keep the useful part.
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") || "Unknown error";
}

export function createSaveCoordinator(options: SaveCoordinatorOptions): SaveCoordinator {
  const debounceMs = options.debounceMs ?? DEFAULT_AUTOSAVE_MS;
  const pending = new Map<string, PendingSave>();
  const failed = new Map<string, PendingSave>();
  const latestByNote = new Map<string, number>();
  const listeners = new Set<() => void>();

  let latestRevision = 0;
  let inFlight: PendingSave | null = null;
  let error: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let draining: Promise<void> | null = null;
  let snapshot: SaveCoordinatorState | null = null;

  const computeStatus = (): SaveStatus => {
    if (inFlight) return "saving";
    if (failed.size > 0) return "error";
    if (pending.size > 0) return "pending";
    return "idle";
  };

  const notify = () => {
    snapshot = null;
    for (const l of listeners) l();
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const drain = (): Promise<void> => {
    if (draining) return draining;
    if (pending.size === 0) return Promise.resolve();
    // Assign the guard BEFORE the body can settle, and release it from a
    // settlement callback: an async body that completes synchronously would
    // otherwise clear the guard first and leave a stale promise behind.
    const run = (async () => {
      while (pending.size > 0) {
        const next = pending.values().next().value as PendingSave;
        pending.delete(next.noteId);
        inFlight = next;
        notify();
        try {
          await options.write(next.noteId, next.body);
          // A newer edit may have queued while we were writing; only then is
          // this revision no longer current.
          const current = latestByNote.get(next.noteId) === next.revision;
          if (failed.get(next.noteId)?.revision === next.revision) failed.delete(next.noteId);
          inFlight = null;
          options.onSaved?.(next, current);
        } catch (err) {
          inFlight = null;
          const message = describeError(err);
          error = message;
          // Keep the newest body for the note: a later pending edit
          // supersedes the failed one (its body already contains it).
          if (!pending.has(next.noteId)) failed.set(next.noteId, next);
          options.onFailed?.(next, message);
        }
        notify();
      }
    })();
    draining = run;
    const release = () => {
      if (draining === run) draining = null;
    };
    run.then(release, release);
    return run;
  };

  const startTimer = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, debounceMs);
  };

  const outcome = (): CloseFlushResult =>
    failed.size === 0 ? { ok: true } : { ok: false, error: error ?? "Save failed" };

  const coordinator: SaveCoordinator = {
    schedule(noteId, body) {
      const save: PendingSave = { noteId, body, revision: ++latestRevision };
      latestByNote.set(noteId, save.revision);
      pending.set(noteId, save);
      // The new buffer supersedes a failed write of the same note.
      if (failed.delete(noteId) && failed.size === 0) error = null;
      startTimer();
      notify();
      return save;
    },

    cancel(noteId) {
      pending.delete(noteId);
      failed.delete(noteId);
      if (failed.size === 0) error = null;
      if (pending.size === 0) clearTimer();
      notify();
    },

    async flush() {
      clearTimer();
      // Loop: a drain may finish while new work was scheduled behind it.
      do {
        await drain();
      } while (pending.size > 0);
      return outcome();
    },

    async retry() {
      for (const save of failed.values()) {
        if (!pending.has(save.noteId)) pending.set(save.noteId, save);
      }
      failed.clear();
      error = null;
      return coordinator.flush();
    },

    discardFailed() {
      const dropped = [...failed.values()];
      failed.clear();
      error = null;
      notify();
      return dropped;
    },

    getUnsavedBody(noteId) {
      return (
        pending.get(noteId)?.body ??
        (inFlight?.noteId === noteId ? inFlight.body : undefined) ??
        failed.get(noteId)?.body ??
        null
      );
    },

    isInFlight: (noteId) => inFlight?.noteId === noteId,

    hasUnsaved: () => pending.size > 0 || inFlight !== null || failed.size > 0,

    isCurrent: (noteId, revision) => latestByNote.get(noteId) === revision,

    getState() {
      if (!snapshot) {
        snapshot = {
          status: computeStatus(),
          latestRevision,
          pending: new Map(pending),
          inFlight,
          failed: new Map(failed),
          error,
        };
      }
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    reset() {
      clearTimer();
      pending.clear();
      failed.clear();
      latestByNote.clear();
      inFlight = null;
      error = null;
      latestRevision = 0;
      notify();
    },
  };

  return coordinator;
}
