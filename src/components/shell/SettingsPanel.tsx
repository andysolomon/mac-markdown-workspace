import React, { useEffect, useRef } from "react";
import { useSettingsStore, type IosStorage } from "../../services/settingsStore";

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

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const showToolbar = useSettingsStore((s) => s.showToolbar);
  const iosStorage = useSettingsStore((s) => s.iosStorage);
  const syncEnabled = useSettingsStore((s) => s.syncEnabled);
  const vimMode = useSettingsStore((s) => s.vimMode);
  const setShowToolbar = useSettingsStore((s) => s.setShowToolbar);
  const setIosStorage = useSettingsStore((s) => s.setIosStorage);
  const setVimMode = useSettingsStore((s) => s.setVimMode);

  const ref = useRef<HTMLDivElement>(null);

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

  const chooseStorage = (storage: IosStorage) => {
    setIosStorage(storage);
    window.appApi?.setSetting?.("iosStorage", storage);
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
        <div className="mm-pop-section">
          <div className="mm-pop-label">Storage</div>
          <div className="mm-mode-row">
            <button
              type="button"
              className={`mm-mode-pill${iosStorage === "icloud" ? " sel" : ""}`}
              onClick={() => chooseStorage("icloud")}
            >
              iCloud
            </button>
            <button
              type="button"
              className={`mm-mode-pill${iosStorage === "device" ? " sel" : ""}`}
              onClick={() => chooseStorage("device")}
            >
              On device
            </button>
          </div>
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
