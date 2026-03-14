import { create } from "zustand";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeState {
  theme: ThemeChoice;
  resolvedTheme: ResolvedTheme;
}

interface ThemeActions {
  setTheme: (theme: ThemeChoice) => void;
  setResolvedTheme: (resolved: ResolvedTheme) => void;
}

export type ThemeStore = ThemeState & ThemeActions;

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: "system",
  resolvedTheme: resolveTheme("system"),

  setTheme: (theme) =>
    set({
      theme,
      resolvedTheme: resolveTheme(theme),
    }),

  setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
}));

// Listen for system theme changes
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
mediaQuery.addEventListener("change", (e) => {
  const state = useThemeStore.getState();
  if (state.theme === "system") {
    state.setResolvedTheme(e.matches ? "dark" : "light");
  }
});
