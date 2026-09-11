/** Height of the markdown helper strip, including its vertical padding. */
export const ACCESSORY_BAR_HEIGHT = 50;

/** Existing mobile bottom-bar clearance used when the editor is not focused. */
export const MOBILE_EDITOR_CHROME_INSET = 88;

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
