import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

test.describe("Workspace Shell", () => {
  test("should show Import, Save, and Export in the toolbar", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await expect(window.getByRole("button", { name: "Import" })).toBeVisible();
    await expect(window.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(window.getByRole("button", { name: "Export" })).toBeVisible();

    await app.close();
  });

  test("should render the three-pane shell with a notes library", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await expect(window.locator(".mm-sidebar")).toBeVisible();
    await expect(window.locator(".mm-doclist")).toBeVisible();
    await expect(window.locator(".mm-topbar")).toBeVisible();
    // The library seeds a welcome note on first run; either way at least one
    // document row exists.
    await expect(window.locator(".mm-doclist .mm-scroll > div").first()).toBeVisible();

    await app.close();
  });
});
