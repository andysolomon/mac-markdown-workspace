import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the web build entry.
 *
 * Bug: `vite.web.config.ts` had no `root`, so the web build compiled from the
 * project-root `index.html`, which loads the Electron renderer entry
 * (`src/renderer.tsx`). That entry never assigns `window.appApi`, so on the web
 * Open/Save/Export threw "undefined is not an object (window.appApi.openFile)".
 *
 * These tests lock in the wiring chain that makes the browser shim ship:
 *   vite.web.config root="web"  ->  web/index.html  ->  web/main.tsx  ->  src/web/entry.tsx  ->  window.appApi = browserApi
 */

// Vitest runs from the repo root; resolve config/entry files relative to it.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

function scriptSrc(html: string): string {
  const match = html.match(/<script[^>]*\bsrc="([^"]+)"/);
  if (!match) throw new Error("no <script src> found in html");
  return match[1];
}

describe("web build entry wiring", () => {
  it("web Vite config roots the build at web/ (so it uses web/index.html, not the Electron root index.html)", () => {
    const config = read("vite.web.config.ts");
    expect(config).toMatch(/root:\s*["']web["']/);
  });

  it("web/index.html loads a shim inside the Vite root (not the Electron renderer)", () => {
    const src = scriptSrc(read("web/index.html"));
    expect(src).toMatch(/^\.\/main\.tsx$/);
    expect(src).not.toContain("renderer");
  });

  it("web/main.tsx forwards to the browser entry", () => {
    const shim = read("web/main.tsx");
    expect(shim).toMatch(/src\/web\/entry/);
    expect(shim).not.toContain("renderer");
  });

  it("the web entry installs the window.appApi browser shim", () => {
    const entry = read("src/web/entry.tsx");
    expect(entry).toMatch(/window\.appApi\s*=\s*browserApi/);
  });

  it("web and Electron entries stay distinct (root index.html remains the Electron renderer)", () => {
    // If a refactor ever points the root index.html at the web entry (or vice
    // versa), one platform loses its correct shim — this catches that.
    const rootSrc = scriptSrc(read("index.html"));
    expect(rootSrc).toContain("src/renderer");
    expect(rootSrc).not.toContain("web/entry");
  });
});
