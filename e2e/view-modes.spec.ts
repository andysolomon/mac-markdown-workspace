import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

test.describe("View Modes", () => {
  test("should switch between source, split, and wysiwyg modes", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    // Default: split mode
    await expect(window.locator(".pane.editor")).toBeVisible();
    await expect(window.locator(".pane.preview")).toBeVisible();

    // Switch to source
    await window.getByRole("button", { name: "Source" }).click();
    await expect(window.locator(".pane.editor.full")).toBeVisible();

    // Switch back to split
    await window.getByRole("button", { name: "Split" }).click();
    await expect(window.locator(".pane.editor")).toBeVisible();
    await expect(window.locator(".pane.preview")).toBeVisible();

    await app.close();
  });
});
