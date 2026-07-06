import { create } from "zustand";

/** App preferences that aren't part of the visual theme. Persisted through
    AppApi settings (electron-store on desktop, localStorage shims elsewhere). */

export type IosStorage = "icloud" | "device";

interface SettingsState {
  /** Show the transitional toolbar row inside the editor column. */
  showToolbar: boolean;
  /** iOS notes location: iCloud-backed Documents vs app-private storage. */
  iosStorage: IosStorage;
}

interface SettingsActions {
  setShowToolbar: (show: boolean) => void;
  setIosStorage: (storage: IosStorage) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>((set) => ({
  showToolbar: true,
  iosStorage: "icloud",

  setShowToolbar: (showToolbar) => set({ showToolbar }),
  setIosStorage: (iosStorage) => set({ iosStorage }),
}));
