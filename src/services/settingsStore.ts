import { create } from "zustand";

/** App preferences that aren't part of the visual theme. Persisted through
    AppApi settings (electron-store on desktop, localStorage shims elsewhere). */

/** iOS notes-library location (issue #8 / W-000008). Canonical values only:
    "documents" = sandbox Documents (backed up with the device, Files-visible
    once the plist keys are set); "private" = Library/NoCloud (app-private,
    excluded from backup). The pre-W-000008 build persisted "icloud"/"device";
    the iOS shim normalizes those on startup and only ever reports canonical
    values back through AppApi. Neither option is iCloud Drive sync — that is
    the encrypted Cloud Sync feature. */
export type IosStorage = "documents" | "private";
export const DEFAULT_IOS_STORAGE: IosStorage = "documents";
export function isIosStorage(value: unknown): value is IosStorage {
  return value === "documents" || value === "private";
}

interface SettingsState {
  /** Show Import/Save/Export + view modes inline in the editor topbar. */
  showToolbar: boolean;
  /** iOS notes location: Documents (backed up) vs private on-device storage. */
  iosStorage: IosStorage;
  /** Passwordless vault sync (issue #21). The passphrase is NEVER stored —
      only the public vault id, whether sync is on, and the last sync time. */
  syncEnabled: boolean;
  syncVaultId: string | null;
  lastSyncedAt: number | null;
  /** CodeMirror Vim keybindings in the source editor. */
  vimMode: boolean;
}

interface SettingsActions {
  setShowToolbar: (show: boolean) => void;
  setIosStorage: (storage: IosStorage) => void;
  setSyncEnabled: (enabled: boolean) => void;
  setSyncVaultId: (vaultId: string | null) => void;
  setLastSyncedAt: (ts: number | null) => void;
  setVimMode: (enabled: boolean) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>((set) => ({
  showToolbar: true,
  iosStorage: DEFAULT_IOS_STORAGE,
  syncEnabled: false,
  syncVaultId: null,
  lastSyncedAt: null,
  vimMode: false,

  setShowToolbar: (showToolbar) => set({ showToolbar }),
  setIosStorage: (iosStorage) => set({ iosStorage }),
  setSyncEnabled: (syncEnabled) => set({ syncEnabled }),
  setSyncVaultId: (syncVaultId) => set({ syncVaultId }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setVimMode: (vimMode) => set({ vimMode }),
}));
