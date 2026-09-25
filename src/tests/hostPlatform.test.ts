import { describe, expect, it } from "vitest";
import { isCommandMod, platformFromOs } from "../services/hostPlatform";

describe("hostPlatform (issue #26)", () => {
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
});
