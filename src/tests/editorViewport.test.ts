import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCESSORY_BAR_HEIGHT,
  IOS_SAFARI_URL_PILL_CLEARANCE,
  KEYBOARD_OPEN_MIN_INSET,
  getMobileEditorBottomInset,
  iosBrowserShowsUrlPill,
  measureAccessoryOffset,
  measureKeyboardInset,
  parseCssPixels,
} from "../services/editorViewport";

describe("editor viewport measurements", () => {
  it("calculates keyboard coverage from visual viewport geometry", () => {
    expect(measureKeyboardInset(844, { height: 390, offsetTop: 0 })).toBe(454);
    expect(measureKeyboardInset(844, { height: 390, offsetTop: 100 })).toBe(354);
  });

  it("lifts the formatting bar above Safari's floating URL pill", () => {
    const iphone = {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
      nativePlatform: false,
    };
    const keyboard = measureKeyboardInset(844, { height: 390, offsetTop: 0 });
    const offset = measureAccessoryOffset(keyboard, iphone);
    // The pill's top is ~64px above the keyboard and overlaps the bar.
    expect(offset - keyboard).toBe(IOS_SAFARI_URL_PILL_CLEARANCE);
    expect(offset - keyboard).toBeGreaterThanOrEqual(64);
    expect(measureAccessoryOffset(0, iphone)).toBe(0);
    expect(measureAccessoryOffset(98, iphone)).toBe(0);
    expect(measureAccessoryOffset(keyboard, { ...iphone, nativePlatform: true })).toBe(keyboard);
    expect(
      measureAccessoryOffset(keyboard, {
        userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile",
        nativePlatform: false,
      }),
    ).toBe(keyboard);
  });

  it("detects the iOS browser URL pill and skips the native shell", () => {
    expect(
      iosBrowserShowsUrlPill({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Safari/604.1",
        nativePlatform: false,
      }),
    ).toBe(true);
    expect(
      iosBrowserShowsUrlPill({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) Safari/604.1",
        nativePlatform: false,
      }),
    ).toBe(true);
    expect(
      iosBrowserShowsUrlPill({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Safari/604.1",
        nativePlatform: true,
      }),
    ).toBe(false);
    expect(iosBrowserShowsUrlPill({ userAgent: "Mozilla/5.0", nativePlatform: false })).toBe(false);
  });

  it("ignores browser chrome when the keyboard is closed", () => {
    const iphone = {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Safari/604.1",
      nativePlatform: false,
    };
    expect(measureAccessoryOffset(0, iphone)).toBe(0);
    expect(measureAccessoryOffset(34, iphone)).toBe(0);
    expect(measureAccessoryOffset(98, iphone)).toBe(0);
    expect(measureAccessoryOffset(KEYBOARD_OPEN_MIN_INSET - 1, iphone)).toBe(0);
  });

  it("keeps the published bar height aligned with the 44px controls", () => {
    expect(ACCESSORY_BAR_HEIGHT).toBe(56);
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
