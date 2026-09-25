/**
 * Mobile editing viewport (issue #10 / #14 / #44 follow-up).
 *
 * While the editor is focused on a phone, the app pins itself to the visual
 * viewport: `.app-shell` takes the visible height and the formatting bar is
 * the last row of the editor column. Nothing is placed with
 * `position: fixed; bottom`, so the geometry never depends on the layout
 * viewport's bottom edge or on `innerHeight` — both are unreliable on iOS 26
 * Safari while the keyboard is up (the bar used to float 70–100pt above the
 * keyboard depending on how far iOS panned the page).
 *
 * The controller writes three things on <html>:
 *   data-mm-editing   "pending" until the first layout pass, then "ready"
 *   data-mm-keyboard  "predicted" | "open" while the shell is pinned
 *   data-mm-url-pill  present on iPhone Safari (not standalone / native)
 * and two custom properties: --mm-vv-height and --mm-vv-top.
 */

/**
 * Height of the markdown helper strip, including its vertical padding.
 * Keep in sync with `.mm-accessory` / `.mm-acc-btn` in shell.css (6 + 44 + 6).
 */
export const ACCESSORY_BAR_HEIGHT = 56;

/** Existing mobile bottom-bar clearance used when the editor is not focused. */
export const MOBILE_EDITOR_CHROME_INSET = 88;

/**
 * Caret clearance above the formatting bar while editing. The bar is part of
 * the layout then, so the editor only needs a little breathing room.
 */
export const EDITING_CARET_MARGIN = 16;

/**
 * Space kept under the formatting bar in iPhone Safari while the keyboard is
 * up. Safari floats its URL pill inside the visual viewport, just above the
 * keyboard: on a 402×874pt iPhone (iOS 26) the pill spans 42pt → 10pt above
 * the keyboard's top edge. 50pt leaves an 8pt gap above the pill. Keep in
 * sync with `.mm-accessory-dock` in shell.css.
 */
export const IOS_SAFARI_URL_PILL_CLEARANCE = 50;

/**
 * Insets smaller than this are Safari's bottom chrome, the home indicator,
 * or a hardware-keyboard shortcut bar — not the software keyboard.
 */
export const KEYBOARD_OPEN_MIN_INSET = 150;

/**
 * First-ever estimate of the keyboard assembly as a share of the window
 * height (iPhone 16 Pro, iOS 26: 359 of 874pt). The measured value replaces
 * it after the keyboard has opened once.
 */
export const KEYBOARD_ESTIMATE_RATIO = 0.41;

/**
 * How long a predicted keyboard may go unconfirmed before the shell unpins
 * (hardware keyboards never raise the software one).
 */
export const KEYBOARD_WAIT_MS = 1500;

/** Un-pan attempts per editing session before deferring to the browser. */
const MAX_UNPAN_ATTEMPTS = 4;

const KEYBOARD_STORE_KEY = "mm.keyboardHeights.v1";

export interface AccessoryHost {
  userAgent: string;
  nativePlatform: boolean;
  /** Launched from the Home Screen (no Safari chrome). */
  standalone?: boolean;
}

export interface VisualViewportMetrics {
  height: number;
  offsetTop: number;
}

/**
 * Height of the software keyboard assembly, from the visual viewport's
 * shrinkage. Panning (offsetTop) does not change the visual viewport's
 * height, so it is deliberately ignored here.
 */
export function measureKeyboardHeight(
  innerHeight: number,
  viewport: Pick<VisualViewportMetrics, "height"> | null | undefined,
): number {
  if (!viewport) return 0;
  const inset = innerHeight - viewport.height;
  return Number.isFinite(inset) ? Math.max(0, Math.round(inset)) : 0;
}

export function isKeyboardOpen(keyboardHeight: number): boolean {
  return keyboardHeight >= KEYBOARD_OPEN_MIN_INSET;
}

/**
 * iPhone Safari (and other iPhone browsers) float a URL pill above the
 * keyboard. The native shell and Home Screen web apps have no browser chrome.
 */
export function iosBrowserShowsUrlPill(host: AccessoryHost): boolean {
  if (host.nativePlatform || host.standalone) return false;
  return /iP(hone|od)/.test(host.userAgent);
}

/** Keyboard height to plan for before the real one has been measured. */
export function estimateKeyboardHeight(innerHeight: number, remembered?: number | null): number {
  if (remembered && isKeyboardOpen(remembered) && remembered < innerHeight) return remembered;
  return Math.round(innerHeight * KEYBOARD_ESTIMATE_RATIO);
}

/** Parse a CSS pixel value while treating missing/invalid values as zero. */
export function parseCssPixels(value: string): number {
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? Math.max(0, pixels) : 0;
}

/**
 * Return the bottom area that CodeMirror must keep clear while on mobile.
 * This is read dynamically by CodeMirror's scroll-margin facet. While editing
 * the formatting bar is part of the layout, so only a small margin is needed;
 * otherwise the fixed bottom tool strip overlays the editor.
 */
export function getMobileEditorBottomInset(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  if (typeof window.matchMedia !== "function" || !window.matchMedia("(max-width: 640px)").matches) {
    return 0;
  }
  return document.documentElement.hasAttribute("data-mm-editing")
    ? EDITING_CARET_MARGIN
    : MOBILE_EDITOR_CHROME_INSET;
}

/** Where the host is running; read from the live window. */
export function detectAccessoryHost(win: Window = window): AccessoryHost {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  const displayStandalone =
    typeof win.matchMedia === "function" && win.matchMedia("(display-mode: standalone)").matches;
  return {
    userAgent: nav.userAgent,
    nativePlatform:
      (win as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ===
      true,
    standalone: nav.standalone === true || displayStandalone,
  };
}

function orientationKey(win: Window): string {
  return win.innerWidth > win.innerHeight ? "landscape" : "portrait";
}

const rememberedKeyboard = new Map<string, number>();

function readRememberedKeyboard(win: Window): number | null {
  const key = orientationKey(win);
  const cached = rememberedKeyboard.get(key);
  if (cached) return cached;
  try {
    const stored = JSON.parse(win.localStorage.getItem(KEYBOARD_STORE_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    const value = Number(stored[key]);
    if (Number.isFinite(value) && value > 0) {
      rememberedKeyboard.set(key, value);
      return value;
    }
  } catch {
    // Storage can be unavailable (private mode, sandboxed views).
  }
  return null;
}

function rememberKeyboard(win: Window, height: number): void {
  const key = orientationKey(win);
  if (rememberedKeyboard.get(key) === height) return;
  rememberedKeyboard.set(key, height);
  try {
    const stored = JSON.parse(win.localStorage.getItem(KEYBOARD_STORE_KEY) ?? "{}") as Record<
      string,
      number
    >;
    stored[key] = height;
    win.localStorage.setItem(KEYBOARD_STORE_KEY, JSON.stringify(stored));
  } catch {
    // Best effort — the in-memory value still serves this session.
  }
}

/** Test hook: forget measured keyboard heights. */
export function resetRememberedKeyboard(): void {
  rememberedKeyboard.clear();
}

/**
 * enter: editing started · keyboard: the pinned area changed · closed: the
 * shell unpinned · resize: the window itself resized (the native shell's
 * WebView shrinks above the keyboard instead of reporting it).
 */
export type VisibleAreaChange = "enter" | "keyboard" | "closed" | "resize";

export interface EditingViewportOptions {
  window?: Window;
  host?: AccessoryHost;
  /** Called after the visible editing area changed (reveal the caret here). */
  onVisibleAreaChange?: (change: VisibleAreaChange) => void;
}

/**
 * Pin the app to the visible area for one editing session. Returns stop().
 *
 * Order of events on an iPhone tap:
 *   1. focus → start(): the bar is hidden ("pending") so it never flashes at
 *      the bottom of the screen.
 *   2. next frame: the caret has been placed. The shell shrinks to the
 *      predicted keyboard line and onVisibleAreaChange("enter") reveals the
 *      caret — before iOS decides whether it must pan the page to show it.
 *   3. visualViewport resize: the measured height replaces the prediction
 *      (usually identical after the first open). Any pan iOS still applied is
 *      undone with scrollTo(0, 0); the header stays on screen.
 */
export function startEditingViewport(options: EditingViewportOptions = {}): () => void {
  const win = options.window ?? window;
  const root = win.document.documentElement;
  const host = options.host ?? detectAccessoryHost(win);
  const notify = options.onVisibleAreaChange ?? (() => undefined);
  const touch =
    (typeof win.matchMedia === "function" && win.matchMedia("(pointer: coarse)").matches) ||
    (win.navigator.maxTouchPoints ?? 0) > 0;
  // The native shell resizes the WebView itself (Keyboard resize: "native").
  const canPredict = touch && !host.nativePlatform;

  let stopped = false;
  let frame: number | null = null;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let applied: { mode: "predicted" | "open" | null; height: number; top: number } = {
    mode: null,
    height: 0,
    top: 0,
  };
  let unpanAttempts = 0;

  const setPinned = (mode: "predicted" | "open", height: number, top: number): boolean => {
    const h = Math.round(height);
    const t = Math.max(0, Math.round(top));
    const changed = applied.mode !== mode || applied.height !== h || applied.top !== t;
    if (!changed) return false;
    const resized = applied.height !== h || applied.mode === null;
    applied = { mode, height: h, top: t };
    root.style.setProperty("--mm-vv-height", `${h}px`);
    root.style.setProperty("--mm-vv-top", `${t}px`);
    root.setAttribute("data-mm-keyboard", mode);
    return resized;
  };

  const unpin = (): boolean => {
    if (applied.mode === null) return false;
    applied = { mode: null, height: 0, top: 0 };
    root.removeAttribute("data-mm-keyboard");
    root.style.removeProperty("--mm-vv-height");
    root.style.removeProperty("--mm-vv-top");
    return true;
  };

  const clearWait = () => {
    if (waitTimer !== null) clearTimeout(waitTimer);
    waitTimer = null;
  };

  const measure = () => {
    const vv = win.visualViewport;
    const keyboard = measureKeyboardHeight(win.innerHeight, vv);
    return { vv, keyboard };
  };

  /** Apply the live geometry. Returns the change to report, if any. */
  const sync = (): VisibleAreaChange | null => {
    const { vv, keyboard } = measure();
    if (vv && isKeyboardOpen(keyboard)) {
      clearWait();
      rememberKeyboard(win, keyboard);
      // iOS pans the page to reveal a caret it thinks the keyboard covers.
      // The shell already fits the visible area, so undo the pan: the header
      // stays put and fixed/sticky geometry stays trustworthy on iOS 26.
      const pageTop = (vv as VisualViewport & { pageTop?: number }).pageTop ?? vv.offsetTop;
      if ((pageTop > 0.5 || win.scrollY > 0.5) && unpanAttempts < MAX_UNPAN_ATTEMPTS) {
        unpanAttempts += 1;
        win.scrollTo(0, 0);
      }
      const top = (vv as VisualViewport & { pageTop?: number }).pageTop ?? vv.offsetTop;
      return setPinned("open", vv.height, top) ? "keyboard" : null;
    }
    if (waitTimer !== null) return null; // keyboard still on its way up
    return unpin() ? "closed" : null;
  };

  let lastInnerHeight = win.innerHeight;
  const onGeometry = () => {
    if (stopped) return;
    const resized = win.innerHeight !== lastInnerHeight;
    lastInnerHeight = win.innerHeight;
    const change = sync() ?? (resized ? "resize" : null);
    if (change) notify(change);
  };

  const enter = () => {
    frame = null;
    if (stopped) return;
    const { keyboard } = measure();
    if (!isKeyboardOpen(keyboard) && canPredict) {
      const predicted = estimateKeyboardHeight(win.innerHeight, readRememberedKeyboard(win));
      setPinned("predicted", win.innerHeight - predicted, 0);
      waitTimer = setTimeout(() => {
        waitTimer = null;
        onGeometry();
      }, KEYBOARD_WAIT_MS);
    } else {
      sync();
    }
    root.setAttribute("data-mm-editing", "ready");
    notify("enter");
  };

  root.setAttribute("data-mm-editing", "pending");
  if (iosBrowserShowsUrlPill(host)) root.setAttribute("data-mm-url-pill", "");

  const vv = win.visualViewport;
  vv?.addEventListener("resize", onGeometry);
  vv?.addEventListener("scroll", onGeometry);
  // Native-resize WebViews report geometry changes on window instead.
  win.addEventListener("resize", onGeometry);

  // Wait one frame: on a tap the caret is placed after focus, and resizing
  // the editor under the finger before then could move the hit target.
  if (typeof win.requestAnimationFrame === "function") {
    frame = win.requestAnimationFrame(enter);
  } else {
    enter();
  }

  return () => {
    stopped = true;
    if (frame !== null) win.cancelAnimationFrame(frame);
    clearWait();
    vv?.removeEventListener("resize", onGeometry);
    vv?.removeEventListener("scroll", onGeometry);
    win.removeEventListener("resize", onGeometry);
    unpin();
    root.removeAttribute("data-mm-editing");
    root.removeAttribute("data-mm-url-pill");
    // iOS 26 can leave the page panned after the keyboard hides; settle it
    // once the dismissal animation is over unless editing resumed.
    setTimeout(() => {
      if (root.hasAttribute("data-mm-editing")) return;
      const viewport = win.visualViewport;
      if (win.scrollY > 0.5 || (viewport?.offsetTop ?? 0) > 0.5) win.scrollTo(0, 0);
    }, 400);
  };
}
