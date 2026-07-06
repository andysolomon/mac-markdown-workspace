# Visual testing (Mac app, web, iOS)

How to visually verify the UI across targets — what exists today, what Playwright
can automate, and what still needs Simulator or a real device.

## Current state

| Target | Automated e2e | Screenshot / visual regression |
|--------|---------------|-------------------------------|
| **Mac (Electron)** | Yes — [`e2e/`](../e2e/) via Playwright `_electron` | No — specs assert DOM only |
| **Web** | No dedicated Playwright project | Manual / agent-browser |
| **iOS (native)** | No | Manual Simulator / device |

Run existing e2e (requires a built Electron main bundle):

```bash
bun start          # once, to produce .vite/build/main.js — or bun run make
bun run test:e2e
```

Specs launch the packaged app through [`e2e/helpers.ts`](../e2e/helpers.ts) and
check visibility and interactions (shell, toolbar, view modes). They do **not** call
`screenshot()` or `toHaveScreenshot()` yet.

---

## Mac app — Playwright Electron + screenshots

Playwright's Electron support can capture the native window and compare against
baselines.

**Ad-hoc screenshot** (debugging or design review):

```typescript
import { test } from "@playwright/test";
import { launchApp } from "./helpers";

test("capture shell", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  // Set theme before capture (attributes live on <html>)
  await window.evaluate(() => {
    document.documentElement.dataset.theme = "teal";
    document.documentElement.dataset.mode = "light";
  });

  await window.screenshot({ path: "e2e/screenshots/shell-teal-light.png" });
  await app.close();
});
```

**Visual regression** (fail CI on unintended pixel drift):

```typescript
await expect(window).toHaveScreenshot("shell-teal-light.png", {
  maxDiffPixelRatio: 0.01,
});
```

First run creates baselines under `e2e/*-spec.ts-snapshots/`. Commit those
images; later runs diff against them.

**Determinism tips** (required for stable screenshots):

- Fixed viewport on the Playwright project (e.g. 1280×800 for desktop shell).
- `animations: "disabled"` in config.
- Wait for fonts: `await window.evaluate(() => document.fonts.ready)`.
- Seed fixed note content via the UI or a test hook before capture.
- Capture per theme: loop `data-theme` × `data-mode` (teal/forest/gold/crimson × light/dark).

Recommended shots for this app:

- Three-pane shell with welcome note (desktop).
- Full-width editor (list icon collapsed).
- Settings popover + Aa font popover.
- Split view with structure-colored markdown visible.

---

## Web — Playwright browser projects

The same React tree runs in the browser (`bun run web:dev`). Add Playwright
**projects** to [`e2e/playwright.config.ts`](../e2e/playwright.config.ts):

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  projects: [
    { name: "electron", testMatch: /app-launch|view-modes|file-operations/ },
    {
      name: "web-chromium",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000/mac-markdown-workspace/" },
      testMatch: /web-visual/,
    },
    {
      name: "web-mobile-webkit",
      use: {
        ...devices["iPhone 14"],
        baseURL: "http://localhost:3000/mac-markdown-workspace/",
      },
      testMatch: /mobile-visual/,
    },
  ],
  webServer: {
    command: "bun run web:dev",
    url: "http://localhost:3000/mac-markdown-workspace/",
    reuseExistingServer: !process.env.CI,
  },
});
```

The **mobile WebKit** project approximates iOS Safari layout and several
WebKit-specific behaviors (e.g. export/share paths). It does **not** replace a
native iOS pass — Capacitor Filesystem, Share sheet, and keyboard accessory
behavior need the Simulator or hardware.

---

## iOS native — what Playwright cannot do

The Capacitor iOS app is a native shell around WKWebView. Playwright does not
drive the Simulator or installed `.ipa` out of the box.

| Method | Best for | Screenshots |
|--------|----------|-------------|
| **Xcode Simulator** | Native shell, safe areas, keyboard, Capacitor plugins | ⌘S in Simulator, or `xcrun simctl io booted screenshot out.png` |
| **Real device** | Share sheet, Files integration, performance | Device screenshot |
| **Playwright WebKit @ 390px** | Mobile layout, bottom bar, accessory bar CSS | `page.screenshot()` |
| **XCUITest** (future) | CI on Simulator | Built-in screenshot APIs |
| **Appium** (future) | Cross-platform native automation | Yes |

Build and open the iOS project:

```bash
bun run ios:sync
bun run ios:open    # Run on simulator or device from Xcode
```

Simulator screenshot from the terminal (booted simulator required):

```bash
xcrun simctl io booted screenshot ~/Desktop/mmw-ios.png
```

**Device checklist** (issues still open for full sign-off — see [`progress.txt`](../progress.txt)):

- Settings → iCloud vs on-device storage
- Export → share sheet (HTML, PDF, TXT, DOCX)
- Markdown accessory bar above the software keyboard
- `visualViewport` offset when the keyboard is open

---

## Quick manual checks — agent-browser (web only)

[agent-browser](https://www.npmjs.com/package/agent-browser) drives Chromium for
fast, agent-friendly visual passes against the dev server:

```bash
bun run web:dev   # in another terminal

agent-browser open http://localhost:3000/mac-markdown-workspace/
agent-browser wait --load networkidle
agent-browser screenshot e2e/screenshots/web-shell.png
```

Useful during development; not a substitute for Playwright baselines or native iOS.

---

## Recommended roadmap

### Phase 1 — Electron visual baselines (highest ROI)

1. Add `e2e/visual-shell.spec.ts` with `toHaveScreenshot` for 2–4 theme combos.
2. Extend [`e2e/playwright.config.ts`](../e2e/playwright.config.ts): fixed viewport, `animations: "disabled"`.
3. Document baseline update workflow: `bun run test:e2e -- --update-snapshots`.

### Phase 2 — Web + mobile WebKit project

1. Add `e2e/web-visual.spec.ts` and `e2e/mobile-visual.spec.ts`.
2. `webServer` in config boots `bun run web:dev`.
3. Mobile shots: bottom bar, accessory bar (editor focused), narrow doc-list sheet.

### Phase 3 — Native iOS (optional CI)

1. Manual Simulator screenshot set checked into `docs/screenshots/ios/` for design reference.
2. Later: XCUITest target in the Xcode project for smoke + screenshot on Simulator.

---

## Commands cheat sheet

```bash
# Unit tests
bun run test

# Electron e2e (behavioral)
bun run test:e2e

# Update Playwright screenshot baselines (after intentional UI change)
bun run test:e2e -- --update-snapshots

# Web dev (for browser / WebKit visual projects)
bun run web:dev

# iOS Simulator
bun run ios:sync && bun run ios:open
xcrun simctl io booted screenshot ~/Desktop/mmw.png
```

---

## Related docs

- [`CLAUDE.md`](../CLAUDE.md) — verification convention: agent-browser / Playwright WebKit / Safari
- [`ios-icloud.md`](./ios-icloud.md) — iOS storage and Files visibility
- [`passwordless-vault-sync.md`](./passwordless-vault-sync.md) — future sync feature (manual cross-device verify until automated)
