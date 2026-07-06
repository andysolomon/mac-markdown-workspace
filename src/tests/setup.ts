/* Vitest setup — jsdom lacks matchMedia, which themeStore and NotesShell
   consume at module scope / mount. */
const noop = (): void => undefined;

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: (): boolean => false,
    }) as unknown as MediaQueryList;
}

/* jsdom lacks WebCrypto subtle — vaultCrypto needs the real Node webcrypto. */
import { webcrypto } from "node:crypto";
if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
