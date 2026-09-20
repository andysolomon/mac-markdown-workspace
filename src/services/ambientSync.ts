import { create } from "zustand";
import { onLibraryChange } from "./libraryEvents";
import { flushNoteSaves, reconcileActiveNoteBuffer } from "./noteAutosave";
import { useNotesStore } from "./notesStore";
import { useSettingsStore } from "./settingsStore";
import type { ConvergeMode, ConvergeResult, SyncBackend } from "./syncBackend";
import { getSessionBackend, restoreSession } from "./vaultSession";

/**
 * Ambient sync (docs/ambient-vault-sync.md, Part 3).
 *
 * Two halves:
 *  - createAmbientScheduler: the framework-free, timer-injectable policy.
 *    Coalesces edits into one push after the user stops typing, polls with
 *    a conditional pull, never runs two cycles at once, backs off on
 *    failure, and parks itself while offline.
 *  - startAmbientSync: wires that policy to the live app — the library
 *    change bus, visibility/pagehide/online events, the settings store, and
 *    the session backend — and publishes status for the chrome.
 *
 * Sync is downstream of local persistence, never a precondition for it: an
 * edit is on disk before this module hears about it.
 */

export const SYNC_PUSH_MS = 10_000;
export const SYNC_PULL_MS = 60_000;
export const BACKOFF_MIN_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

export type AmbientStatus =
  /** Sync is not enabled on this device. */
  | "off"
  /** Enabled, but no resident keys: needs the passphrase once. */
  | "locked"
  | "idle"
  | "syncing"
  | "offline"
  | "error";

export interface AmbientSchedulerDeps {
  run(mode: ConvergeMode): Promise<ConvergeResult>;
  /** Runs before a "full" cycle captures its change watermark — the app
      flushes the editing buffer here so the snapshot carries the latest
      text and the flush's own change event doesn't dirty the cycle. */
  prepare?(): Promise<void>;
  onStatus?(status: AmbientStatus, detail: { error?: string; result?: ConvergeResult }): void;
  isOnline?(): boolean;
  setTimeout?(fn: () => void, ms: number): unknown;
  clearTimeout?(handle: unknown): void;
  pushDelayMs?: number;
  backoffMinMs?: number;
  backoffMaxMs?: number;
}

export interface AmbientSchedulerState {
  dirty: boolean;
  running: boolean;
  status: AmbientStatus;
  backoffMs: number;
  lastError: string | null;
}

export interface AmbientScheduler {
  /** A local mutation landed; (re)start the push debounce. */
  noteChanged(): void;
  /** Push right away if anything is dirty (blur, note switch, close). */
  pushNow(): Promise<void>;
  /** Poll: a conditional pull, upgraded to a full cycle if dirty. */
  pullNow(): Promise<void>;
  /** User-initiated full cycle; rethrows so the UI can show the failure. */
  syncNow(): Promise<ConvergeResult>;
  stop(): void;
  getState(): AmbientSchedulerState;
}

/** fetch fails with a TypeError (never a Response) when the network is
    unreachable; treat that as offline rather than an error to surface. */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

export function createAmbientScheduler(deps: AmbientSchedulerDeps): AmbientScheduler {
  const setT: (fn: () => void, ms: number) => unknown =
    deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT: (handle: unknown) => void =
    deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const pushDelayMs = deps.pushDelayMs ?? SYNC_PUSH_MS;
  const backoffMinMs = deps.backoffMinMs ?? BACKOFF_MIN_MS;
  const backoffMaxMs = deps.backoffMaxMs ?? BACKOFF_MAX_MS;

  // Dirtiness is a watermark, not a flag: a change that lands mid-cycle
  // must survive that cycle's success.
  let changeSeq = 0;
  let syncedSeq = 0;
  let running: Promise<void> | null = null;
  let queued: ConvergeMode | null = null;
  let pushTimer: unknown = null;
  let retryTimer: unknown = null;
  let backoffMs = backoffMinMs;
  let status: AmbientStatus = "idle";
  let lastError: string | null = null;
  let stopped = false;

  const dirty = () => changeSeq > syncedSeq;

  const setStatus = (next: AmbientStatus, detail: { error?: string; result?: ConvergeResult } = {}) => {
    status = next;
    deps.onStatus?.(next, detail);
  };

  const clearPush = () => {
    if (pushTimer !== null) {
      clearT(pushTimer);
      pushTimer = null;
    }
  };
  const clearRetry = () => {
    if (retryTimer !== null) {
      clearT(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = () => {
    clearRetry();
    const delay = backoffMs;
    backoffMs = Math.min(backoffMs * 2, backoffMaxMs);
    retryTimer = setT(() => {
      retryTimer = null;
      void cycle(dirty() ? "full" : "pull-if-changed");
    }, delay);
  };

  /** One cycle. Single-flight: a request that arrives mid-cycle is queued
      and run once afterwards (a "full" request wins over a poll). Rethrows
      only when asked to — the background callers read status instead. */
  const cycle = async (mode: ConvergeMode, rethrow = false): Promise<ConvergeResult | null> => {
    if (stopped) return null;
    if (running) {
      if (!rethrow) {
        // Background caller: queue and leave. The finishing cycle dispatches
        // the follow-up ("full" wins over a poll).
        queued = mode === "full" || queued === "full" ? "full" : (queued ?? mode);
        return null;
      }
      // User-initiated: wait until the loop is free (the current cycle and
      // any follow-up it dispatches — `running` never rejects), then run a
      // fresh full cycle of our own so the caller's result is really theirs.
      while (running) await running;
      if (stopped) return null;
    }
    if (deps.isOnline && !deps.isOnline()) {
      setStatus("offline");
      if (rethrow) throw new Error("You're offline — sync will resume when the connection is back.");
      return null;
    }

    let result: ConvergeResult | null = null;
    let failure: unknown = null;
    const run = (async () => {
      setStatus("syncing");
      try {
        const effective = dirty() ? "full" : mode;
        if (effective === "full") await deps.prepare?.();
        const seqAtStart = changeSeq;
        result = await deps.run(effective);
        if (effective === "full" && seqAtStart > syncedSeq) syncedSeq = seqAtStart;
        backoffMs = backoffMinMs;
        lastError = null;
        clearRetry();
        setStatus("idle", { result });
      } catch (error) {
        failure = error;
        lastError = error instanceof Error ? error.message : String(error);
        const offline = isNetworkFailure(error) || (deps.isOnline ? !deps.isOnline() : false);
        setStatus(offline ? "offline" : "error", { error: lastError });
        scheduleRetry();
      }
    })();
    running = run;
    try {
      await run;
    } finally {
      if (running === run) running = null;
    }

    if (failure) {
      queued = null; // the retry timer owns the follow-up; never loop on failure
      if (rethrow) throw failure;
      return null;
    }
    const next = queued;
    queued = null;
    if (!stopped && (next || dirty())) void cycle(next ?? "full");
    return result;
  };

  return {
    noteChanged() {
      changeSeq++;
      if (stopped) return;
      clearPush();
      pushTimer = setT(() => {
        pushTimer = null;
        void cycle("full");
      }, pushDelayMs);
    },

    async pushNow() {
      clearPush();
      if (dirty()) await cycle("full");
    },

    async pullNow() {
      await cycle("pull-if-changed");
    },

    async syncNow() {
      clearPush();
      const result = await cycle("full", true);
      // cycle(…, true) only resolves null when stopped.
      return result ?? { pulled: 0, pushed: false, notModified: true };
    },

    stop() {
      stopped = true;
      clearPush();
      clearRetry();
    },

    getState() {
      return { dirty: dirty(), running: running !== null, status, backoffMs, lastError };
    },
  };
}

// ---------------------------------------------------------------------------
// Runtime: the scheduler bound to the live app.
// ---------------------------------------------------------------------------

interface SyncStatusState {
  status: AmbientStatus;
  error: string | null;
  setStatus: (status: AmbientStatus, error?: string | null) => void;
}

/** Read by the chrome's sync indicator. */
export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  status: "off",
  error: null,
  setStatus: (status, error = null) => set({ status, error }),
}));

let runtime: { scheduler: AmbientScheduler; vaultId: string; dispose: () => void } | null = null;
let unsubscribeSettings: (() => void) | null = null;

async function persistLastSynced(): Promise<void> {
  const ts = Date.now();
  useSettingsStore.getState().setLastSyncedAt(ts);
  await window.appApi?.setSetting?.("lastSyncedAt", ts);
}

function bind(backend: SyncBackend): void {
  runtime?.dispose();

  const scheduler = createAmbientScheduler({
    prepare: async () => {
      const flushed = await flushNoteSaves();
      if ("error" in flushed) throw new Error(`Save your changes before syncing: ${flushed.error}`);
    },
    run: async (mode) => {
      const result = await backend.converge(mode);
      if (result.pulled > 0) {
        await useNotesStore.getState().reloadLibrary();
        reconcileActiveNoteBuffer();
      }
      if (!result.notModified) await persistLastSynced();
      return result;
    },
    onStatus: (status, detail) => useSyncStatusStore.getState().setStatus(status, detail.error ?? null),
    isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  });

  const offChange = onLibraryChange(() => scheduler.noteChanged());
  const onVisibility = () => {
    if (document.visibilityState === "visible") void scheduler.pullNow();
    else void scheduler.pushNow();
  };
  const onPageHide = (): void => {
    void scheduler.pushNow();
  };
  const onOnline = (): void => {
    void scheduler.pullNow();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("online", onOnline);
  const interval = window.setInterval(() => {
    if (document.visibilityState === "visible") void scheduler.pullNow();
  }, SYNC_PULL_MS);

  runtime = {
    scheduler,
    vaultId: backend.vaultId,
    dispose: () => {
      scheduler.stop();
      offChange();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
      runtime = null;
    },
  };

  void scheduler.pullNow();
}

let bindGeneration = 0;

/** React to the persisted sync config: bind when a vault has resident keys,
    show "locked" when it doesn't, tear down when sync is off. */
function reconcile(): void {
  const { syncEnabled, syncVaultId } = useSettingsStore.getState();
  const generation = ++bindGeneration;

  if (!syncEnabled || !syncVaultId) {
    runtime?.dispose();
    useSyncStatusStore.getState().setStatus("off");
    return;
  }
  if (runtime?.vaultId === syncVaultId) return;

  const already = getSessionBackend(syncVaultId);
  if (already) {
    bind(already);
    return;
  }
  useSyncStatusStore.getState().setStatus("locked");
  void restoreSession(syncVaultId).then((backend) => {
    if (generation !== bindGeneration) return; // config moved on meanwhile
    if (backend) bind(backend);
  });
}

/** Start the ambient loop for the app's lifetime. Idempotent. */
export function startAmbientSync(): () => void {
  if (!unsubscribeSettings) {
    unsubscribeSettings = useSettingsStore.subscribe((s, prev) => {
      if (s.syncEnabled !== prev.syncEnabled || s.syncVaultId !== prev.syncVaultId) reconcile();
    });
    reconcile();
  }
  return stopAmbientSync;
}

export function stopAmbientSync(): void {
  unsubscribeSettings?.();
  unsubscribeSettings = null;
  runtime?.dispose();
  useSyncStatusStore.getState().setStatus("off");
}

/** After a passphrase unlocked (or re-derived) the keys for the bound
    vault, attach the loop to that session without waiting for a settings
    change. */
export function rebindAmbientSync(): void {
  bindGeneration++;
  const { syncVaultId } = useSettingsStore.getState();
  const backend = syncVaultId ? getSessionBackend(syncVaultId) : null;
  if (backend && runtime?.vaultId !== backend.vaultId) bind(backend);
}

/** The live scheduler, if the loop is bound — lets a user-initiated
    "Sync now" share single-flight with background cycles. */
export function getAmbientScheduler(): AmbientScheduler | null {
  return runtime?.scheduler ?? null;
}

/** Best-effort push for the host close handshake: bounded so a slow network
    can never hold the window open. */
export async function pushBeforeClose(timeoutMs = 4000): Promise<void> {
  const scheduler = runtime?.scheduler;
  if (!scheduler) return;
  await Promise.race([
    scheduler.pushNow(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
