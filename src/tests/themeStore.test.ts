import { describe, it, expect, beforeEach } from "vitest";
import {
  useThemeStore,
  PALETTES,
  FONT_OPTIONS,
  MIN_EDITOR_SIZE,
  MAX_EDITOR_SIZE,
  DEFAULT_EDITOR_SIZE,
} from "../services/themeStore";

describe("themeStore", () => {
  beforeEach(() => {
    useThemeStore.setState({
      palette: "teal",
      mode: "system",
      resolvedMode: "light",
      font: "avenir",
      size: DEFAULT_EDITOR_SIZE,
    });
  });

  it("defaults to teal / system / brand face at the 20px base", () => {
    const s = useThemeStore.getState();
    expect(s.palette).toBe("teal");
    expect(s.mode).toBe("system");
    expect(s.font).toBe("avenir");
    expect(s.size).toBe(20);
  });

  it("setMode resolves system-independent modes directly", () => {
    useThemeStore.getState().setMode("dark");
    expect(useThemeStore.getState().resolvedMode).toBe("dark");
    useThemeStore.getState().setMode("light");
    expect(useThemeStore.getState().resolvedMode).toBe("light");
  });

  it("cyclePalette walks all four palettes and wraps", () => {
    const seen: string[] = [useThemeStore.getState().palette];
    for (let i = 0; i < PALETTES.length; i++) {
      useThemeStore.getState().cyclePalette();
      seen.push(useThemeStore.getState().palette);
    }
    expect(seen).toEqual([
      "teal",
      "forest",
      "gold",
      "crimson",
      "blue",
      "olive",
      "graphite",
      "red",
      "teal",
    ]);
  });

  it("setSize clamps to the 16-28 range and rounds", () => {
    useThemeStore.getState().setSize(10);
    expect(useThemeStore.getState().size).toBe(MIN_EDITOR_SIZE);
    useThemeStore.getState().setSize(99);
    expect(useThemeStore.getState().size).toBe(MAX_EDITOR_SIZE);
    useThemeStore.getState().setSize(21.6);
    expect(useThemeStore.getState().size).toBe(22);
  });

  it("every font option maps to a token variable", () => {
    for (const f of FONT_OPTIONS) {
      expect(f.cssVar).toMatch(/^--mm-font-/);
    }
    useThemeStore.getState().setFont("georgia");
    expect(useThemeStore.getState().font).toBe("georgia");
  });
});
