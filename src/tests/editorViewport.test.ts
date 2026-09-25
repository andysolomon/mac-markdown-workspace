import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCESSORY_BAR_HEIGHT,
  EDITING_CARET_MARGIN,
  IOS_SAFARI_URL_PILL_CLEARANCE,
  KEYBOARD_ESTIMATE_RATIO,
  KEYBOARD_OPEN_MIN_INSET,
  KEYBOARD_WAIT_MS,
  MOBILE_EDITOR_CHROME_INSET,
  estimateKeyboardHeight,
  getMobileEditorBottomInset,
  iosBrowserShowsUrlPill,
  isKeyboardOpen,
  measureKeyboardHeight,
  parseCssPixels,
  resetRememberedKeyboard,
  startEditingViewport,
  type AccessoryHost,
} from "../services/editorViewport";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const IPHONE: AccessoryHost = { userAgent: IPHONE_SAFARI, nativePlatform: false };

describe("editor viewport measurements", () => {
  it("measures the keyboard from the visual viewport's shrinkage, ignoring pan", () => {
    expect(measureKeyboardHeight(874, { height: 515 })).toBe(359);
    // iOS panning moves offsetTop, not the keyboard's size.
    expect(measureKeyboardHeight(874, { height: 515, offsetTop: 159 } as { height: number })).toBe(
      359,
    );
  });

  it("clamps missing, invalid, and non-covering geometry to zero", () => {
    expect(measureKeyboardHeight(874, null)).toBe(0);
    expect(measureKeyboardHeight(874, undefined)).toBe(0);
    expect(measureKeyboardHeight(390, { height: 874 })).toBe(0);
    expect(measureKeyboardHeight(Number.NaN, { height: 390 })).toBe(0);
  });

  it("treats browser chrome and hardware-keyboard bars as a closed keyboard", () => {
    expect(isKeyboardOpen(0)).toBe(false);
    expect(isKeyboardOpen(34)).toBe(false);
    expect(isKeyboardOpen(98)).toBe(false);
    expect(isKeyboardOpen(KEYBOARD_OPEN_MIN_INSET - 1)).toBe(false);
    expect(isKeyboardOpen(KEYBOARD_OPEN_MIN_INSET)).toBe(true);
    expect(isKeyboardOpen(359)).toBe(true);
  });

  it("detects the iPhone browser URL pill and skips chrome-free hosts", () => {
    expect(iosBrowserShowsUrlPill(IPHONE)).toBe(true);
    expect(iosBrowserShowsUrlPill({ ...IPHONE, nativePlatform: true })).toBe(false);
    expect(iosBrowserShowsUrlPill({ ...IPHONE, standalone: true })).toBe(false);
    expect(
      iosBrowserShowsUrlPill({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) Safari/604.1",
        nativePlatform: false,
      }),
    ).toBe(false);
    expect(
      iosBrowserShowsUrlPill({
        userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile",
        nativePlatform: false,
      }),
    ).toBe(false);
  });

  it("clears Safari's URL pill with a small gap", () => {
    // The pill's top edge is 42pt above the keyboard on an iOS 26 iPhone.
    expect(IOS_SAFARI_URL_PILL_CLEARANCE).toBeGreaterThanOrEqual(42);
    expect(IOS_SAFARI_URL_PILL_CLEARANCE).toBeLessThanOrEqual(56);
  });

  it("estimates the keyboard until one has been measured", () => {
    expect(estimateKeyboardHeight(874)).toBe(Math.round(874 * KEYBOARD_ESTIMATE_RATIO));
    expect(estimateKeyboardHeight(874, 359)).toBe(359);
    // Implausible memories fall back to the estimate.
    expect(estimateKeyboardHeight(874, 40)).toBe(Math.round(874 * KEYBOARD_ESTIMATE_RATIO));
    expect(estimateKeyboardHeight(874, 900)).toBe(Math.round(874 * KEYBOARD_ESTIMATE_RATIO));
  });

  it("keeps the published bar height aligned with the 44px controls", () => {
    expect(ACCESSORY_BAR_HEIGHT).toBe(56);
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
    });

    afterEach(() => {
      document.documentElement.removeAttribute("data-mm-editing");
      vi.restoreAllMocks();
    });

    it("clears the fixed bottom tool strip while reading", () => {
      expect(getMobileEditorBottomInset()).toBe(MOBILE_EDITOR_CHROME_INSET);
    });

    it("only needs a small caret margin while editing (the bar is in the layout)", () => {
      document.documentElement.setAttribute("data-mm-editing", "ready");
      expect(getMobileEditorBottomInset()).toBe(EDITING_CARET_MARGIN);
    });

    it("does not add mobile clearance on desktop", () => {
      vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
      document.documentElement.setAttribute("data-mm-editing", "ready");
      expect(getMobileEditorBottomInset()).toBe(0);
    });
  });
});

/** A window stand-in whose visual viewport is driven like the iOS keyboard. */
function createPhone({ touch = true, innerHeight = 874 } = {}) {
  const vvEvents = new EventTarget();
  const winEvents = new EventTarget();
  const frames: FrameRequestCallback[] = [];
  const storage = new Map<string, string>();
  const vv = {
    height: innerHeight,
    offsetTop: 0,
    get pageTop() {
      return this.offsetTop;
    },
    addEventListener: vi.fn((type: string, fn: EventListener) => vvEvents.addEventListener(type, fn)),
    removeEventListener: vi.fn((type: string, fn: EventListener) =>
      vvEvents.removeEventListener(type, fn),
    ),
  };
  const win = {
    document,
    innerWidth: 402,
    innerHeight,
    scrollY: 0,
    visualViewport: vv,
    navigator: { userAgent: IPHONE_SAFARI, maxTouchPoints: touch ? 5 : 0 },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
    },
    matchMedia: (q: string) => ({ matches: touch && q === "(pointer: coarse)" }),
    requestAnimationFrame: (fn: FrameRequestCallback) => frames.push(fn),
    cancelAnimationFrame: vi.fn(),
    scrollTo: vi.fn(() => {
      vv.offsetTop = 0;
    }),
    addEventListener: (type: string, fn: EventListener) => winEvents.addEventListener(type, fn),
    removeEventListener: (type: string, fn: EventListener) => winEvents.removeEventListener(type, fn),
    dispatchEvent: (event: Event) => winEvents.dispatchEvent(event),
  };
  return {
    win: win as unknown as Window,
    vv,
    storage,
    /** Run the frame queued by start(). */
    frame() {
      frames.splice(0).forEach((fn) => fn(0));
    },
    /** Keyboard finished animating: iOS shrinks the viewport (and may pan). */
    keyboard(height: number, pan = 0) {
      vv.height = innerHeight - height;
      vv.offsetTop = pan;
      vvEvents.dispatchEvent(new Event("resize"));
      if (pan) vvEvents.dispatchEvent(new Event("scroll"));
    },
    scroll() {
      vvEvents.dispatchEvent(new Event("scroll"));
    },
  };
}

const html = () => document.documentElement;
const cssVar = (name: string) => html().style.getPropertyValue(name);

describe("startEditingViewport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRememberedKeyboard();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("hides the bar until the first layout pass, then pins to the predicted keyboard line", () => {
    const phone = createPhone();
    const changes: string[] = [];
    const stop = startEditingViewport({
      window: phone.win,
      host: IPHONE,
      onVisibleAreaChange: (c) => changes.push(c),
    });

    // Before the caret has been placed nothing may move under the finger.
    expect(html().getAttribute("data-mm-editing")).toBe("pending");
    expect(html().hasAttribute("data-mm-keyboard")).toBe(false);
    expect(changes).toEqual([]);

    phone.frame();
    const predicted = 874 - Math.round(874 * KEYBOARD_ESTIMATE_RATIO);
    expect(html().getAttribute("data-mm-editing")).toBe("ready");
    expect(html().getAttribute("data-mm-keyboard")).toBe("predicted");
    expect(html().hasAttribute("data-mm-url-pill")).toBe(true);
    expect(cssVar("--mm-vv-height")).toBe(`${predicted}px`);
    expect(changes).toEqual(["enter"]);

    stop();
  });

  it("confirms with the measured keyboard and predicts it exactly next time", () => {
    const phone = createPhone();
    const changes: string[] = [];
    const stop = startEditingViewport({
      window: phone.win,
      host: IPHONE,
      onVisibleAreaChange: (c) => changes.push(c),
    });
    phone.frame();
    phone.keyboard(359);

    expect(html().getAttribute("data-mm-keyboard")).toBe("open");
    expect(cssVar("--mm-vv-height")).toBe("515px");
    expect(cssVar("--mm-vv-top")).toBe("0px");
    expect(changes).toEqual(["enter", "keyboard"]);
    stop();

    // Second session: the prediction is the measured keyboard, so nothing
    // moves when the keyboard arrives.
    const again = createPhone();
    const second: string[] = [];
    const stopAgain = startEditingViewport({
      window: again.win,
      host: IPHONE,
      onVisibleAreaChange: (c) => second.push(c),
    });
    again.frame();
    expect(cssVar("--mm-vv-height")).toBe("515px");
    again.keyboard(359);
    expect(html().getAttribute("data-mm-keyboard")).toBe("open");
    expect(second).toEqual(["enter"]);
    stopAgain();
  });

  it("undoes an iOS pan so the header stays on screen", () => {
    const phone = createPhone();
    const stop = startEditingViewport({ window: phone.win, host: IPHONE });
    phone.frame();
    phone.keyboard(359, 159);

    expect(phone.win.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(phone.vv.offsetTop).toBe(0);
    expect(cssVar("--mm-vv-top")).toBe("0px");
    stop();
  });

  it("follows a pan the browser refuses to undo", () => {
    const phone = createPhone();
    vi.mocked(phone.win.scrollTo).mockImplementation(() => undefined);
    const stop = startEditingViewport({ window: phone.win, host: IPHONE });
    phone.frame();
    phone.keyboard(359, 120);

    expect(cssVar("--mm-vv-top")).toBe("120px");
    expect(cssVar("--mm-vv-height")).toBe("515px");
    stop();
  });

  it("never reveals the caret for plain scroll events", () => {
    const phone = createPhone();
    const changes: string[] = [];
    const stop = startEditingViewport({
      window: phone.win,
      host: IPHONE,
      onVisibleAreaChange: (c) => changes.push(c),
    });
    phone.frame();
    phone.keyboard(359);
    changes.length = 0;

    phone.scroll();
    phone.scroll();
    phone.win.dispatchEvent(new Event("scroll"));

    expect(changes).toEqual([]);
    stop();
  });

  it("unpins when no software keyboard arrives (hardware keyboard)", () => {
    const phone = createPhone();
    const changes: string[] = [];
    const stop = startEditingViewport({
      window: phone.win,
      host: IPHONE,
      onVisibleAreaChange: (c) => changes.push(c),
    });
    phone.frame();
    expect(html().getAttribute("data-mm-keyboard")).toBe("predicted");

    vi.advanceTimersByTime(KEYBOARD_WAIT_MS);
    expect(html().hasAttribute("data-mm-keyboard")).toBe(false);
    expect(cssVar("--mm-vv-height")).toBe("");
    expect(changes).toEqual(["enter", "closed"]);
    stop();
  });

  it("unpins when the keyboard hides while the editor keeps focus", () => {
    const phone = createPhone();
    const stop = startEditingViewport({ window: phone.win, host: IPHONE });
    phone.frame();
    phone.keyboard(359);
    phone.keyboard(0);

    expect(html().hasAttribute("data-mm-keyboard")).toBe(false);
    expect(html().getAttribute("data-mm-editing")).toBe("ready");
    stop();
  });

  it("leaves native resize and pointer devices unpinned", () => {
    const native = createPhone();
    const stop = startEditingViewport({
      window: native.win,
      host: { ...IPHONE, nativePlatform: true },
    });
    native.frame();
    expect(html().hasAttribute("data-mm-keyboard")).toBe(false);
    expect(html().hasAttribute("data-mm-url-pill")).toBe(false);
    stop();

    const desktop = createPhone({ touch: false });
    const stopDesktop = startEditingViewport({ window: desktop.win, host: IPHONE });
    desktop.frame();
    expect(html().hasAttribute("data-mm-keyboard")).toBe(false);
    stopDesktop();
  });

  it("reveals the caret when the native shell resizes the WebView", () => {
    const phone = createPhone();
    const changes: string[] = [];
    const stop = startEditingViewport({
      window: phone.win,
      host: { ...IPHONE, nativePlatform: true },
      onVisibleAreaChange: (c) => changes.push(c),
    });
    phone.frame();
    // Capacitor Keyboard resize: "native" — the whole window shrinks.
    (phone.win as unknown as { innerHeight: number }).innerHeight = 515;
    phone.vv.height = 515;
    phone.win.dispatchEvent(new Event("resize"));

    expect(html().hasAttribute("data-mm-keyboard")).toBe(false);
    expect(changes).toEqual(["enter", "resize"]);
    stop();
  });

  it("clears every attribute and listener on stop", () => {
    const phone = createPhone();
    const stop = startEditingViewport({ window: phone.win, host: IPHONE });
    phone.frame();
    phone.keyboard(359);
    stop();

    expect(html().hasAttribute("data-mm-editing")).toBe(false);
    expect(html().hasAttribute("data-mm-keyboard")).toBe(false);
    expect(html().hasAttribute("data-mm-url-pill")).toBe(false);
    expect(cssVar("--mm-vv-height")).toBe("");
    expect(cssVar("--mm-vv-top")).toBe("");
    expect(phone.vv.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(phone.vv.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
