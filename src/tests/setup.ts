/* Vitest setup — jsdom lacks matchMedia, which themeStore and NotesShell
   consume at module scope / mount. */
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: (): boolean => false,
    }) as unknown as MediaQueryList;
}
