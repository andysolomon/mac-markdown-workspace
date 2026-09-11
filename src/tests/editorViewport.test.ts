import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMobileEditorBottomInset,
  measureKeyboardInset,
  parseCssPixels,
} from "../services/editorViewport";

describe("editor viewport measurements", () => {
  it("calculates keyboard coverage from visual viewport geometry", () => {
    expect(measureKeyboardInset(844, { height: 390, offsetTop: 0 })).toBe(454);
    expect(measureKeyboardInset(844, { height: 390, offsetTop: 100 })).toBe(354);
  });

  it("clamps missing, invalid, and non-covering geometry to zero", () => {
    expect(measureKeyboardInset(844, null)).toBe(0);
    expect(measureKeyboardInset(844, undefined)).toBe(0);
    expect(measureKeyboardInset(390, { height: 844, offsetTop: 0 })).toBe(0);
    expect(measureKeyboardInset(Number.NaN, { height: 390, offsetTop: 0 })).toBe(0);
  });

  it("parses CSS pixel values defensively", () => {
    expect(parseCssPixels("454px")).toBe(454);
    expect(parseCssPixels(" 12.5px ")).toBe(12.5);
    expect(parseCssPixels("auto")).toBe(0);
    expect(parseCssPixels("-10px")).toBe(0);
  });

  describe("getMobileEditorBottomInset", () => {
    beforeEach(() => {
      vi.spyOn(window, "matchMedia").mockImplementation(
        () => ({ matches: true }) as MediaQueryList,
      );
      document.documentElement.style.removeProperty("--mm-kb-inset");
    });

    afterEach(() => {
      document.documentElement.style.removeProperty("--mm-kb-inset");
      vi.restoreAllMocks();
    });

    it("keeps the existing mobile chrome clearance before the keyboard opens", () => {
      expect(getMobileEditorBottomInset()).toBe(88);
    });

    it("uses the larger keyboard-plus-accessory inset", () => {
      document.documentElement.style.setProperty("--mm-kb-inset", "504px");
      expect(getMobileEditorBottomInset()).toBe(504);
    });

    it("does not add mobile clearance on desktop", () => {
      vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
      document.documentElement.style.setProperty("--mm-kb-inset", "504px");
      expect(getMobileEditorBottomInset()).toBe(0);
    });
  });
});
