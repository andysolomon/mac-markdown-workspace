import { create } from "zustand";

/** App preferences that aren't part of the visual theme. Persisted through
    AppApi settings (electron-store on desktop, localStorage shims elsewhere). */

export type IosStorage = "icloud" | "device";

interface SettingsState {
  /** Show the transitional toolbar row inside the editor column. */
  showToolbar: boolean;
  /** iOS notes location: iCloud-backed Documents vs app-private storage. */
  iosStorage: IosStorage;
  /** Passwordless vault sync (issue #21). The passphrase is NEVER stored —
      only the public vault id, whether sync is on, and the last sync time. */
  syncEnabled: boolean;
  syncVaultId: string | null;
  lastSyncedAt: number | null;
}

interface SettingsActions {
  setShowToolbar: (show: boolean) => void;
  setIosStorage: (storage: IosStorage) => void;
  setSyncEnabled: (enabled: boolean) => void;
  setSyncVaultId: (vaultId: string | null) => void;
  setLastSyncedAt: (ts: number | null) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>((set) => ({
  showToolbar: true,
  iosStorage: "icloud",
  syncEnabled: false,
  syncVaultId: null,
  lastSyncedAt: null,

  setShowToolbar: (showToolbar) => set({ showToolbar }),
  setIosStorage: (iosStorage) => set({ iosStorage }),
  setSyncEnabled: (syncEnabled) => set({ syncEnabled }),
  setSyncVaultId: (syncVaultId) => set({ syncVaultId }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}));
