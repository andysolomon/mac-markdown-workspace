import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

test.describe("Hyprland desktop adaptation (issue #26)", () => {
  test("half-tile mins, Linux platform metadata, and no WindowDots", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await expect(window.locator(".workspace")).toBeVisible({ timeout: 15_000 });
    await expect(window.locator(".mm-toolbar-inline")).toBeVisible();

    const electronWindow = await app.browserWindow(window);
    const size = await electronWindow.evaluate((win) => {
      const [minWidth, minHeight] = win.getMinimumSize();
      // Prove a sub-980 half-tile size is allowed.
      win.setSize(800, 600);
      const [width, height] = win.getSize();
      return { width, height, minWidth, minHeight };
    });

    expect(size.minWidth).toBeLessThanOrEqual(640);
    expect(size.minHeight).toBeLessThanOrEqual(480);
    expect(size.width).toBe(800);
    expect(size.height).toBe(600);

    const platform = await window.evaluate(() => window.appApi?.platform ?? null);
    expect(platform).not.toBeNull();
    if (!platform) throw new Error("expected appApi.platform");
    expect(["darwin", "linux", "win32", "unknown"]).toContain(platform.os);

    if (platform.os === "linux") {
      expect(platform.showWindowDots).toBe(false);
      expect(platform.commandUsesCtrl).toBe(true);
      await expect(window.locator(".mm-dots-row")).toHaveCount(0);
    }

    await app.close();
  });
});
