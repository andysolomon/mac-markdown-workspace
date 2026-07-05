import { create } from "zustand";

export type Palette = "teal" | "forest" | "gold" | "crimson";
export type ModeChoice = "light" | "dark" | "system";
export type ResolvedMode = "light" | "dark";

export const PALETTES: Palette[] = ["teal", "forest", "gold", "crimson"];
export const MODES: ModeChoice[] = ["light", "dark", "system"];

interface ThemeState {
  palette: Palette;
  mode: ModeChoice;
  resolvedMode: ResolvedMode;
}

interface ThemeActions {
  setPalette: (palette: Palette) => void;
  setMode: (mode: ModeChoice) => void;
  setResolvedMode: (resolvedMode: ResolvedMode) => void;
  cyclePalette: () => void;
  cycleMode: () => void;
}

export type ThemeStore = ThemeState & ThemeActions;

function resolveMode(choice: ModeChoice): ResolvedMode {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  palette: "teal",
  mode: "system",
  resolvedMode: resolveMode("system"),

  setPalette: (palette) => set({ palette }),
  setMode: (mode) => set({ mode, resolvedMode: resolveMode(mode) }),
  setResolvedMode: (resolvedMode) => set({ resolvedMode }),

  cyclePalette: () => {
    const idx = PALETTES.indexOf(get().palette);
    set({ palette: PALETTES[(idx + 1) % PALETTES.length] });
  },
  cycleMode: () => {
    const idx = MODES.indexOf(get().mode);
    const next = MODES[(idx + 1) % MODES.length];
    set({ mode: next, resolvedMode: resolveMode(next) });
  },
}));

// Follow the OS when mode is "system".
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
mediaQuery.addEventListener("change", (e) => {
  const state = useThemeStore.getState();
  if (state.mode === "system") {
    state.setResolvedMode(e.matches ? "dark" : "light");
  }
});
