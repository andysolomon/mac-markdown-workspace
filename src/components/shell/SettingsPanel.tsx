import React, { useEffect, useRef, useState } from "react";
import { useSettingsStore, type IosStorage } from "../../services/settingsStore";
import { useNotesStore } from "../../services/notesStore";
import { useDocumentStore } from "../../services/documentStore";

/** True inside the native Capacitor (iOS) runtime, where the storage choice
    applies. Capacitor's core registers a web shim global when bundled, so
    existence alone is not enough — ask the platform. */
function isCapacitor(): boolean {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/**
 * SettingsPanel — app preferences in the popover design language (issue #6).
 * Houses the toolbar visibility toggle (#7) and, on iOS, the notes storage
 * location (#8). Every change applies live and persists via AppApi settings.
 */
/** Opens the Cloud Sync modal (rendered by NotesShell); `auto` jumps a
    configured device straight to the passphrase prompt. */
export const OPEN_SYNC_EVENT = "mm-open-sync";
export function openSyncModal(auto = false): void {
  window.dispatchEvent(new CustomEvent(OPEN_SYNC_EVENT, { detail: { auto } }));
}

/** Copy for the iOS storage choice (issue #8). Neither option is iCloud
    Drive sync — cross-device sync is the encrypted Cloud Sync feature. */
export const IOS_STORAGE_OPTIONS: ReadonlyArray<{
  value: IosStorage;
  label: string;
  description: string;
}> = [
  {
    value: "documents",
    label: "Documents & Backup",
    description: "Kept in the app's Documents folder. Included in device backups.",
  },
  {
    value: "private",
    label: "On device",
    description: "Kept in app-private storage. Excluded from backups.",
  },
];
export const IOS_STORAGE_HINT =
  "Moves your notes library between the two locations. To sync across devices, use Cloud Sync.";

/**
 * Switch the iOS notes location transactionally (issue #8 / W-000008).
 * 1. Flush a pending edit of the active note so the migration snapshot holds
 *    the latest content (the NotesShell autosave may still be debouncing).
 * 2. Await the shim's `setSetting`, which copies + verifies + activates and
 *    rejects — leaving the old location active — on failure.
 * 3. Only after success update the settings store and re-read the library
 *    from the new root (ids are preserved, so the active note stays put).
 */
export async function switchIosStorage(next: IosStorage): Promise<void> {
  const notes = useNotesStore.getState();
  const active = notes.notes.find((n) => n.id === notes.activeNoteId);
  const buffer = useDocumentStore.getState().content;
  if (active && buffer !== active.body) {
    await notes.updateActiveNote(buffer);
    useDocumentStore.getState().markClean();
  }
  await window.appApi?.setSetting?.("iosStorage", next);
  useSettingsStore.getState().setIosStorage(next);
  await useNotesStore.getState().reloadLibrary();
}

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const showToolbar = useSettingsStore((s) => s.showToolbar);
  const iosStorage = useSettingsStore((s) => s.iosStorage);
  const syncEnabled = useSettingsStore((s) => s.syncEnabled);
  const vimMode = useSettingsStore((s) => s.vimMode);
  const setShowToolbar = useSettingsStore((s) => s.setShowToolbar);
  const setVimMode = useSettingsStore((s) => s.setVimMode);

  const ref = useRef<HTMLDivElement>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      // Ignore the "…" trigger — its click must toggle the panel closed
      // instead of close-on-mousedown + reopen-on-click (issue #15).
      if (target.closest && target.closest(".mm-more")) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const toggleToolbar = () => {
    const next = !showToolbar;
    setShowToolbar(next);
    window.appApi?.setSetting?.("showToolbar", next);
  };

  const chooseStorage = async (storage: IosStorage) => {
    if (storageBusy || storage === iosStorage) return;
    setStorageBusy(true);
    setStorageError(null);
    try {
      await switchIosStorage(storage);
    } catch (err) {
      // The shim left the previous location active; keep the previous pill
      // selected (the store was never updated) and surface the reason.
      const message = err instanceof Error ? err.message : "Could not move notes";
      setStorageError(`${message}. Your notes are still in the previous location.`);
    } finally {
      setStorageBusy(false);
    }
  };

  const toggleVimMode = () => {
    const next = !vimMode;
    setVimMode(next);
    window.appApi?.setSetting?.("vimMode", next);
  };

  // The toolbar is desktop-only chrome (mobile uses page navigation), so its
  // toggle is meaningless — and confusing — on narrow viewports (issue #18).
  const isNarrow = window.matchMedia("(max-width: 640px)").matches;

  return (
    <div className="mm-popover mm-settings" ref={ref}>
      {!isNarrow ? (
        <div className="mm-pop-section">
          <div className="mm-pop-label">Toolbar</div>
          <div className="mm-setting-row">
            <span>Show toolbar</span>
            <button
              type="button"
              role="switch"
              aria-checked={showToolbar}
              className={`mm-toggle${showToolbar ? " on" : ""}`}
              onClick={toggleToolbar}
            >
              <span className="mm-toggle-knob" />
            </button>
          </div>
        </div>
      ) : null}

      {isCapacitor() ? (
        <div className="mm-pop-section" data-testid="ios-storage-section">
          <div className="mm-pop-label">Storage</div>
          <div
            className="mm-mode-row"
            role="radiogroup"
            aria-label="Notes storage location"
            aria-busy={storageBusy}
          >
            {IOS_STORAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={iosStorage === opt.value}
                title={opt.description}
                className={`mm-mode-pill${iosStorage === opt.value ? " sel" : ""}`}
                disabled={storageBusy}
                onClick={() => void chooseStorage(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mm-sync-note" aria-live="polite">
            {storageBusy ? "Moving notes…" : IOS_STORAGE_HINT}
          </p>
          {storageError ? (
            <p className="mm-sync-error" role="alert">
              {storageError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mm-pop-section">
        <div className="mm-pop-label">Editor</div>
        <div className="mm-setting-row">
          <span>Vim keybindings</span>
          <button
            type="button"
            role="switch"
            aria-checked={vimMode}
            className={`mm-toggle${vimMode ? " on" : ""}`}
            onClick={toggleVimMode}
          >
            <span className="mm-toggle-knob" />
          </button>
        </div>
      </div>

      <div className="mm-pop-section">
        <div className="mm-pop-label">Cloud Sync</div>
        <button
          type="button"
          className="mm-setting-row mm-setting-action"
          onClick={() => {
            onClose();
            openSyncModal(false);
          }}
        >
          <span>{syncEnabled ? "Manage sync" : "Set up sync"}</span>
          <span className={`mm-sync-status${syncEnabled ? " on" : ""}`}>
            {syncEnabled ? "On" : "Off"}
          </span>
        </button>
      </div>

      <div className="mm-build-id">Build {__BUILD_ID__}</div>
    </div>
  );
}
