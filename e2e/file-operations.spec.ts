import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

test.describe("File Operations", () => {
  test("should show Open, Save, and Export buttons", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await expect(window.getByRole("button", { name: "Open" })).toBeVisible();
    await expect(window.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(window.getByRole("button", { name: "Export" })).toBeVisible();

    await app.close();
  });

  test("should show unsaved document indicator", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await expect(window.locator(".right-group")).toContainText("Unsaved document");

    await app.close();
  });
});
