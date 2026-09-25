/**
 * Isolated tests for the mobile editing viewport (src/services/editorViewport.ts).
 * The web E2E spec (e2e/web-mobile-editing.spec.ts) drives the Safari/Chrome
 * paths; these cover only what it cannot reach.
 *
 * Failure modes:
 *   1. Reading on a phone, CodeMirror's scroll margin no longer clears the
 *      fixed bottom tool strip → the caret scrolls underneath it.
 *   2. Editing on a phone, the scroll margin still reserves the tool strip's
 *      88px although the formatting bar is now in the layout → typing near
 *      the bar makes the text jump far above it.
 *   3. Native iOS shell (Capacitor Keyboard resize: "native"; unreachable from
 *      the web E2E): the WebView itself shrinks above the keyboard, so the
 *      visual viewport never reports a keyboard. The controller must not pin
 *      or predict, and must still reveal the caret on the window resize — or
 *      the caret ends up hidden under the formatting bar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMobileEditorBottomInset, startEditingViewport } from "../services/editorViewport";

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

  it("clears the fixed bottom tool strip while reading (failure mode 1)", () => {
    expect(getMobileEditorBottomInset()).toBe(88);
  });

  it("only keeps a small caret margin above the in-layout bar while editing (failure mode 2)", () => {
    document.documentElement.setAttribute("data-mm-editing", "ready");
    expect(getMobileEditorBottomInset()).toBeLessThan(88);
  });
});

describe("native iOS shell", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays unpinned and reveals the caret when the WebView resizes (failure mode 3)", () => {
    vi.useFakeTimers();
    const winEvents = new EventTarget();
    const frames: FrameRequestCallback[] = [];
    const viewport = {
      height: 874,
      offsetTop: 0,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    };
    const win = {
      document,
      innerWidth: 402,
      innerHeight: 874,
      scrollY: 0,
      visualViewport: viewport,
      navigator: {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
        maxTouchPoints: 5,
      },
      matchMedia: (q: string) => ({ matches: q === "(pointer: coarse)" }),
      requestAnimationFrame: (fn: FrameRequestCallback) => frames.push(fn),
      cancelAnimationFrame: (): void => undefined,
      scrollTo: vi.fn(),
      addEventListener: (type: string, fn: EventListener) => winEvents.addEventListener(type, fn),
      removeEventListener: (type: string, fn: EventListener) =>
        winEvents.removeEventListener(type, fn),
    };
    const changes: string[] = [];
    const stop = startEditingViewport({
      window: win as unknown as Window,
      host: { userAgent: win.navigator.userAgent, nativePlatform: true },
      onVisibleAreaChange: (change) => changes.push(change),
    });
    frames.splice(0).forEach((fn) => fn(0));

    // Keyboard up: the whole WebView shrinks; the visual viewport matches it.
    win.innerHeight = 515;
    viewport.height = 515;
    winEvents.dispatchEvent(new Event("resize"));

    const root = document.documentElement;
    expect(root.hasAttribute("data-mm-keyboard")).toBe(false);
    expect(root.hasAttribute("data-mm-url-pill")).toBe(false);
    expect(changes).toEqual(["enter", "resize"]);

    stop();
    vi.runOnlyPendingTimers();
  });
});
