import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Default BrowserWindow size from src/main.ts — keep e2e above the 640px
    mobile breakpoint. On Hyprland, new windows may be tiled smaller now that
    minWidth is 640 (#26); pin an explicit desktop size after launch. */
const E2E_WINDOW_WIDTH = 1320;
const E2E_WINDOW_HEIGHT = 860;

export async function launchApp(options?: { args?: string[]; env?: NodeJS.ProcessEnv }) {
  const electronPath = path.join(__dirname, "..", "node_modules", ".bin", "electron");
  const mainPath = path.join(__dirname, "..", ".vite", "build", "main.js");
  const extra = options?.args ?? [];
  const hasUserData = extra.some((arg) => arg === "--user-data-dir" || arg.startsWith("--user-data-dir="));
  const userData = hasUserData ? null : await mkdtemp(path.join(os.tmpdir(), "mmw-e2e-ud-"));
  const args = [
    mainPath,
    ...(userData ? [`--user-data-dir=${userData}`] : []),
    ...extra,
  ];

  const app: ElectronApplication = await electron.launch({
    executablePath: electronPath,
    args,
    env: options?.env ? { ...process.env, ...options.env } : undefined,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  const electronWindow = await app.browserWindow(window);
  // Hyprland may re-tile; retry until the renderer sees a desktop width so
  // NotesShell leaves the ≤640px mobile stack (issue #26).
  for (let attempt = 0; attempt < 10; attempt++) {
    await electronWindow.evaluate(
      (win, size) => {
        if (win.isMinimized()) win.restore();
        win.setSize(size.width, size.height);
        win.center();
      },
      { width: E2E_WINDOW_WIDTH, height: E2E_WINDOW_HEIGHT },
    );
    await window.evaluate(() => {
      window.dispatchEvent(new Event("resize"));
    });
    const width = await window.evaluate(() => window.innerWidth);
    if (width > 640) break;
    await window.waitForTimeout(100);
  }

  return app;
}
