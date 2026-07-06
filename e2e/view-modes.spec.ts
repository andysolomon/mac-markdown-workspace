import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

test.describe("View Modes", () => {
  test("should default to source and switch between modes", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    // Default: source mode (full-width editor pane, no preview)
    await expect(window.locator(".pane.editor.full")).toBeVisible();
    await expect(window.locator(".pane.preview")).not.toBeVisible();

    // Switch to split
    await window.getByRole("button", { name: "Split" }).click();
    await expect(window.locator(".pane.editor")).toBeVisible();
    await expect(window.locator(".pane.preview")).toBeVisible();

    // Back to source
    await window.getByRole("button", { name: "Source", exact: true }).click();
    await expect(window.locator(".pane.editor.full")).toBeVisible();

    await app.close();
  });
});
