import { create } from "zustand";

/** App preferences that aren't part of the visual theme. Persisted through
    AppApi settings (electron-store on desktop, localStorage shims elsewhere). */

export type IosStorage = "icloud" | "device";

interface SettingsState {
  /** Show Import/Save/Export + view modes inline in the editor topbar. */
  showToolbar: boolean;
  /** iOS notes location: iCloud-backed Documents vs app-private storage. */
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
  iosStorage: "icloud",
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
