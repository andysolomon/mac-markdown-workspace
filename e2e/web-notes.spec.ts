import { expect, test } from "@playwright/test";

/**
 * Browser smoke for the web build (`--project=web`).
 * The notes library is IndexedDB, so a reload in the same context must
 * still show a note that autosave has already listed.
 */
test("loads the welcome note and keeps a newly typed note across reload", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Mac Markdown Workspace/);
  await expect(page.locator(".mm-shell")).toBeVisible();

  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("Welcome to Mac Markdown");

  await page.getByRole("button", { name: "New note" }).click();
  await expect(editor).not.toContainText("Welcome to Mac Markdown");
  await editor.click();
  await page.keyboard.type("# CI smoke note");

  // The document list title updates only after the debounced write lands.
  await expect(page.locator(".mm-doc-row", { hasText: "CI smoke note" })).toBeVisible();

  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("CI smoke note");
  await expect(page.locator(".mm-doc-row", { hasText: "Welcome to Mac Markdown" })).toBeVisible();
});
