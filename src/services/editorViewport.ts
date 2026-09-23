/**
 * Height of the markdown helper strip, including its vertical padding.
 * Keep in sync with `.mm-accessory` / `.mm-acc-btn` in shell.css (6 + 44 + 6).
 */
export const ACCESSORY_BAR_HEIGHT = 56;

/** Existing mobile bottom-bar clearance used when the editor is not focused. */
export const MOBILE_EDITOR_CHROME_INSET = 88;

/**
 * Lift applied on top of a real keyboard inset while editing in mobile Safari.
 *
 * Safari draws a floating URL pill inside the visual viewport, just above the
 * keyboard. `visualViewport` does not shrink for that pill, so a bar placed
 * flush with the keyboard ends up underneath it. On a 402pt iPhone screenshot
 * the pill's top sits about 64px above the keyboard. 72px clears that pill.
 * The strip under the bar is painted with the theme background — the clearance
 * must not show the white canvas.
 */
export const IOS_SAFARI_URL_PILL_CLEARANCE = 72;

/**
 * Insets smaller than this are Safari's bottom chrome or the home indicator,
 * not the software keyboard. Portrait iPhone keyboards are well above it.
 * Treating chrome as a keyboard lifts the bar while the keyboard is closed.
 */
export const KEYBOARD_OPEN_MIN_INSET = 150;

export interface AccessoryHost {
  userAgent: string;
  nativePlatform: boolean;
}

export interface VisualViewportMetrics {
  height: number;
  offsetTop: number;
}

/**
 * Return the portion of the layout viewport covered by the on-screen keyboard.
 *
 * VisualViewport coordinates are relative to the layout viewport. Including
 * offsetTop matters when iOS pans the page while the keyboard is open; using
 * only `innerHeight - height` would place the accessory bar too low in that
 * case.
 */
export function measureKeyboardInset(
  innerHeight: number,
  viewport: VisualViewportMetrics | null | undefined,
): number {
  if (!viewport) return 0;
  const inset = innerHeight - (viewport.height + viewport.offsetTop);
  return Number.isFinite(inset) ? Math.max(0, inset) : 0;
}

/** iPhone/iPad Safari (and other iOS browsers). The native shell has no URL pill. */
export function iosBrowserShowsUrlPill(host: AccessoryHost): boolean {
  if (host.nativePlatform) return false;
  return /iP(hone|ad|od)/.test(host.userAgent);
}

/**
 * Bottom offset for the formatting bar. Browser chrome alone leaves the bar
 * on the bottom edge. A real keyboard on iOS Safari also clears the URL pill.
 */
export function measureAccessoryOffset(
  keyboardInset: number,
  host: AccessoryHost,
): number {
  const inset = Number.isFinite(keyboardInset) ? Math.max(0, keyboardInset) : 0;
  if (inset < KEYBOARD_OPEN_MIN_INSET) return 0;
  if (!iosBrowserShowsUrlPill(host)) return inset;
  return inset + IOS_SAFARI_URL_PILL_CLEARANCE;
}

/** Parse a CSS pixel value while treating missing/invalid values as zero. */
export function parseCssPixels(value: string): number {
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? Math.max(0, pixels) : 0;
}

/**
 * Return the bottom area that CodeMirror must keep clear while on mobile.
 * This is read dynamically by CodeMirror's scroll-margin facet, so changing
 * --mm-kb-inset does not require rebuilding the editor extensions.
 */
export function getMobileEditorBottomInset(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  if (typeof window.matchMedia !== "function" || !window.matchMedia("(max-width: 640px)").matches) {
    return 0;
  }

  const keyboardAndAccessory = parseCssPixels(
    window.getComputedStyle(document.documentElement).getPropertyValue("--mm-kb-inset"),
  );
  return Math.max(MOBILE_EDITOR_CHROME_INSET, keyboardAndAccessory);
}
