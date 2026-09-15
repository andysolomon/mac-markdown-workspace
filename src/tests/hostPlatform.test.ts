import { describe, expect, it } from "vitest";
import {
  hostOsFromNodePlatform,
  includeMacAppMenuRoles,
  isCommandMod,
  menuActionToExportFormat,
  normalizeShortcutKey,
  platformFromOs,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
} from "../services/hostPlatform";

describe("hostPlatform (issue #26)", () => {
  it("maps node platforms and keeps window mins half-tile friendly", () => {
    expect(hostOsFromNodePlatform("linux")).toBe("linux");
    expect(hostOsFromNodePlatform("darwin")).toBe("darwin");
    expect(hostOsFromNodePlatform("freebsd")).toBe("unknown");
    expect(WINDOW_MIN_WIDTH).toBeLessThanOrEqual(640);
    expect(WINDOW_MIN_WIDTH).toBeLessThanOrEqual(960);
    expect(WINDOW_MIN_HEIGHT).toBeLessThanOrEqual(480);
  });

  it("hides WindowDots on Linux/Windows/iOS and keeps them on darwin/web", () => {
    expect(platformFromOs("linux").showWindowDots).toBe(false);
    expect(platformFromOs("win32").showWindowDots).toBe(false);
    expect(platformFromOs("ios").showWindowDots).toBe(false);
    expect(platformFromOs("darwin").showWindowDots).toBe(true);
    expect(platformFromOs("web").showWindowDots).toBe(true);
  });

  it("uses Ctrl-only command mod on Linux so Super stays with Hyprland", () => {
    const linux = platformFromOs("linux");
    expect(isCommandMod({ ctrlKey: true, metaKey: false }, linux)).toBe(true);
    expect(isCommandMod({ ctrlKey: false, metaKey: true }, linux)).toBe(false);
    expect(isCommandMod({ ctrlKey: true, metaKey: true }, linux)).toBe(true);
  });

  it("uses Cmd-only command mod on macOS", () => {
    const darwin = platformFromOs("darwin");
    expect(isCommandMod({ ctrlKey: false, metaKey: true }, darwin)).toBe(true);
    expect(isCommandMod({ ctrlKey: true, metaKey: false }, darwin)).toBe(false);
  });

  it("accepts either mod on web", () => {
    const web = platformFromOs("web");
    expect(isCommandMod({ ctrlKey: true, metaKey: false }, web)).toBe(true);
    expect(isCommandMod({ ctrlKey: false, metaKey: true }, web)).toBe(true);
  });

  it("normalizes Shift+letter chords to lowercase", () => {
    expect(normalizeShortcutKey("S")).toBe("s");
    expect(normalizeShortcutKey("s")).toBe("s");
    expect(normalizeShortcutKey("ArrowUp")).toBe("ArrowUp");
  });

  it("maps native export menu actions to exportDocument formats", () => {
    expect(menuActionToExportFormat("export-txt")).toBe("txt");
    expect(menuActionToExportFormat("export-pdf")).toBe("pdf");
    expect(menuActionToExportFormat("export-docx")).toBe("docx");
    expect(menuActionToExportFormat("export-html")).toBe("html");
    expect(menuActionToExportFormat("save-file")).toBeNull();
  });

  it("gates macOS app-menu roles to darwin only", () => {
    expect(includeMacAppMenuRoles("darwin")).toBe(true);
    expect(includeMacAppMenuRoles("linux")).toBe(false);
    expect(includeMacAppMenuRoles("win32")).toBe(false);
  });
});
