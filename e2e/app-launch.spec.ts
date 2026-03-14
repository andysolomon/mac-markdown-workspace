import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

test.describe("App Launch", () => {
  test("should launch and show the main window", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    const title = await window.title();
    expect(title).toContain("Mac Markdown Workspace");

    await app.close();
  });

  test("should have toolbar, workspace, and status bar", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await expect(window.locator(".toolbar")).toBeVisible();
    await expect(window.locator(".workspace")).toBeVisible();
    await expect(window.locator(".status-bar")).toBeVisible();

    await app.close();
  });
});
