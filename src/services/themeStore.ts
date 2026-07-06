import { create } from "zustand";

export type Palette =
  | "teal"
  | "forest"
  | "gold"
  | "crimson"
  | "blue"
  | "olive"
  | "graphite"
  | "red";
export type ModeChoice = "light" | "dark" | "system";
export type ResolvedMode = "light" | "dark";

export const PALETTES: Palette[] = [
  "teal",
  "forest",
  "gold",
  "crimson",
  "blue",
  "olive",
  "graphite",
  "red",
];
export const MODES: ModeChoice[] = ["light", "dark", "system"];

/** Reader-selectable editor faces (the Aa popover). Each maps to a token
    stack in tokens/typography.css; "avenir" is the brand face. */
export type FontChoice =
  | "avenir"
  | "cochin"
  | "courier"
  | "georgia"
  | "helvetica"
  | "iowan"
  | "menlo"
  | "palatino"
  | "times";

export const FONT_OPTIONS: { key: FontChoice; label: string; cssVar: string }[] = [
  { key: "avenir", label: "Avenir Next", cssVar: "--mm-font-sans" },
  { key: "cochin", label: "Cochin", cssVar: "--mm-font-cochin" },
  { key: "courier", label: "Courier", cssVar: "--mm-font-courier" },
  { key: "georgia", label: "Georgia", cssVar: "--mm-font-georgia" },
  { key: "helvetica", label: "Helvetica Neue", cssVar: "--mm-font-helvetica" },
  { key: "iowan", label: "Iowan Old Style", cssVar: "--mm-font-iowan" },
  { key: "menlo", label: "Menlo", cssVar: "--mm-font-menlo" },
  { key: "palatino", label: "Palatino", cssVar: "--mm-font-palatino" },
  { key: "times", label: "Times New Roman", cssVar: "--mm-font-times" },
];

export const MIN_EDITOR_SIZE = 16;
export const MAX_EDITOR_SIZE = 28;
export const DEFAULT_EDITOR_SIZE = 20;

interface ThemeState {
  palette: Palette;
  mode: ModeChoice;
  resolvedMode: ResolvedMode;
  font: FontChoice;
  size: number;
}

interface ThemeActions {
  setPalette: (palette: Palette) => void;
  setMode: (mode: ModeChoice) => void;
  setResolvedMode: (resolvedMode: ResolvedMode) => void;
  cyclePalette: () => void;
  cycleMode: () => void;
  setFont: (font: FontChoice) => void;
  setSize: (size: number) => void;
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
  font: "avenir",
  size: DEFAULT_EDITOR_SIZE,

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

  setFont: (font) => set({ font }),
  setSize: (size) =>
    set({ size: Math.min(MAX_EDITOR_SIZE, Math.max(MIN_EDITOR_SIZE, Math.round(size))) }),
}));

// Follow the OS when mode is "system".
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
mediaQuery.addEventListener("change", (e) => {
  const state = useThemeStore.getState();
  if (state.mode === "system") {
    state.setResolvedMode(e.matches ? "dark" : "light");
  }
});
