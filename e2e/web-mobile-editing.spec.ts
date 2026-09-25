import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phone edit mode (`--project=web`): the formatting bar must ride on the
 * keyboard, the header must stay on screen, and the note must stay
 * scrollable while typing.
 *
 * Chromium has no software keyboard, so window.visualViewport is replaced by
 * a stand-in that behaves like iOS Safari's: `__vv.set(height, offsetTop)`
 * is the keyboard finishing its animation (and iOS panning the page), and
 * window.scrollTo(0, 0) un-pans it unless `__vv.refuseUnpan` is set.
 *
 * Artifact: the iPhone run attaches a screenshot and a JSON geometry snapshot
 * of the keyboard-up state (fixed viewport, fixed note, fresh context).
 */

const W = 402;
const H = 874; // iPhone 16 Pro, points
const KEYBOARD = 359; // iOS 26 keyboard assembly incl. the ⌃⌄✓ capsule
const VISIBLE = H - KEYBOARD;
const URL_PILL_CLEARANCE = 50; // IOS_SAFARI_URL_PILL_CLEARANCE

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

const FAKE_VISUAL_VIEWPORT = `(() => {
  const events = new EventTarget();
  const state = { height: window.innerHeight, offsetTop: 0 };
  const vv = {
    get width() { return window.innerWidth; },
    get height() { return state.height; },
    get offsetTop() { return state.offsetTop; },
    get offsetLeft() { return 0; },
    get pageTop() { return state.offsetTop; },
    get pageLeft() { return 0; },
    get scale() { return 1; },
    addEventListener: (...a) => events.addEventListener(...a),
    removeEventListener: (...a) => events.removeEventListener(...a),
    dispatchEvent: (e) => events.dispatchEvent(e),
  };
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
  window.__vv = {
    refuseUnpan: false,
    set(height, offsetTop) {
      state.height = height;
      state.offsetTop = offsetTop;
      events.dispatchEvent(new Event("resize"));
      events.dispatchEvent(new Event("scroll"));
    },
  };
  const scrollTo = window.scrollTo.bind(window);
  window.scrollTo = (x, y) => {
    const top = typeof x === "object" && x ? x.top : y;
    if (top === 0 && state.offsetTop !== 0 && !window.__vv.refuseUnpan) {
      state.offsetTop = 0;
      queueMicrotask(() => events.dispatchEvent(new Event("scroll")));
    }
    return scrollTo(x, y);
  };
})();`;

const NOTE = Array.from({ length: 14 }, (_, i) =>
  i % 2 ? "" : `- Paragraph ${i / 2 + 1}: the caret stays put, the chrome stays put, and only the text moves.`,
).join("\n");

async function openLongNote(page: Page) {
  await page.addInitScript(FAKE_VISUAL_VIEWPORT);
  await page.goto("/");
  await page.getByRole("button", { name: "New note" }).first().click();
  const editor = page.locator(".cm-content");
  await editor.focus();
  await page.keyboard.insertText(NOTE);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page.locator(".mm-bottombar")).toBeVisible();
  await scrollEditorBy(page, -Infinity);
}

/** Scroll the note by `delta` (clamped by the browser); returns the new scrollTop. */
function scrollEditorBy(page: Page, delta: number) {
  return page.evaluate((by) => {
    const scroller = document.querySelector(".cm-scroller");
    if (!scroller) throw new Error("editor is not rendered");
    scroller.scrollTop = Number.isFinite(by) ? scroller.scrollTop + by : 0;
    return scroller.scrollTop;
  }, delta);
}

/** Layout-viewport rect — the coordinate space visualViewport describes. */
async function box(page: Page, selector: string) {
  const rect = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (!rect) throw new Error(`${selector} is not rendered`);
  return rect;
}

type FakeViewport = {
  __vv: { refuseUnpan: boolean; set(height: number, offsetTop: number): void };
};

/** The keyboard finished animating; iOS may also have panned the page. */
async function keyboardUp(page: Page, offsetTop = 0) {
  await page.evaluate(
    ([h, top]) => (window as unknown as FakeViewport).__vv.set(h, top),
    [VISIBLE, offsetTop],
  );
}

async function keyboardDown(page: Page) {
  await page.evaluate((h) => (window as unknown as FakeViewport).__vv.set(h, 0), H);
}

/** How far the visual viewport is panned into the page. */
function pan(page: Page) {
  return page.evaluate(() => window.visualViewport?.offsetTop ?? 0);
}

/** Where an element's top edge is on the physical screen (pan applied). */
async function screenTop(page: Page, selector: string) {
  return (await box(page, selector)).top - (await pan(page));
}

/** Where an element's bottom edge is on the physical screen (pan applied). */
async function screenBottom(page: Page, selector: string) {
  return (await box(page, selector)).bottom - (await pan(page));
}

/** Tap a line in the lower half of the note, where the keyboard will land. */
async function tapLowerHalf(page: Page) {
  await page.touchscreen.tap(W / 2, 640);
  await expect(page.locator(".mm-accessory")).toBeVisible();
}

test.describe("iPhone Safari", () => {
  test.use({
    viewport: { width: W, height: H },
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_SAFARI,
    // Geometry is asserted at rest; the bar's entrance fade is motion only.
    contextOptions: { reducedMotion: "reduce" },
  });

  test("the formatting bar rides on the keyboard and the note stays scrollable", async ({
    page,
  }, testInfo) => {
    await openLongNote(page);
    const bar = page.locator(".mm-accessory");

    await tapLowerHalf(page);
    await expect(page.locator(".mm-bottombar")).toHaveCount(0);

    // Before the keyboard has even arrived, the bar and the caret are already
    // above the predicted keyboard line — iOS has nothing to pan for.
    await expect
      .poll(async () => (await box(page, ".mm-accessory")).bottom)
      .toBeLessThanOrEqual(VISIBLE - URL_PILL_CLEARANCE + 2);
    const predictedBar = await box(page, ".mm-accessory");
    expect((await box(page, ".cm-cursor-primary")).bottom).toBeLessThanOrEqual(predictedBar.top);

    // Keyboard up: flush with the stack, just above Safari's URL pill — not
    // floating mid-screen.
    await keyboardUp(page);
    await expect
      .poll(async () => Math.abs((await box(page, ".mm-accessory")).bottom - (VISIBLE - URL_PILL_CLEARANCE)))
      .toBeLessThanOrEqual(1);
    expect(await screenTop(page, ".mm-topbar")).toBeGreaterThanOrEqual(0);
    const shotPath = testInfo.outputPath("keyboard-up.png");
    await page.screenshot({ path: shotPath });
    const keyboardUpGeometry = {
      viewport: { width: W, height: H, visibleAboveKeyboard: VISIBLE },
      header: await box(page, ".mm-topbar"),
      bar: await box(page, ".mm-accessory"),
      caret: await box(page, ".cm-cursor-primary"),
      urlPillClearance: VISIBLE - (await box(page, ".mm-accessory")).bottom,
    };

    // iOS pans the page anyway → it is undone; the header stays on screen.
    await keyboardUp(page, 159);
    await expect.poll(() => screenTop(page, ".mm-topbar")).toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => (await box(page, ".mm-accessory")).bottom - (await pan(page)))
      .toBeLessThanOrEqual(VISIBLE - URL_PILL_CLEARANCE + 1);

    // Scrolling back through the note while typing is not dragged back to the caret.
    const requested = await scrollEditorBy(page, -200);
    await page.waitForTimeout(300);
    expect(await scrollEditorBy(page, 0)).toBe(requested);

    // Formatting keeps the editor focused (the keyboard stays up).
    const bold = await box(page, '.mm-acc-btn[aria-label="Bold"]');
    await page.touchscreen.tap(bold.x, bold.y);
    await expect(page.locator(".cm-content")).toContainText("****");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest(".cm-content")),
    ).toBe(true);

    // ✓ dismisses: the reading chrome returns and the app fills the screen again.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await keyboardDown(page);
    await expect(page.locator(".mm-bottombar")).toBeVisible();
    await expect(bar).toHaveCount(0);
    await expect.poll(async () => (await box(page, ".app-shell")).bottom).toBe(H);

    // Next edit: the measured keyboard is remembered, so the bar lands on its
    // final spot before the keyboard arrives — nothing moves when it does.
    await tapLowerHalf(page);
    await expect
      .poll(async () => Math.abs((await box(page, ".mm-accessory")).bottom - (VISIBLE - URL_PILL_CLEARANCE)))
      .toBeLessThanOrEqual(1);

    const geometryPath = testInfo.outputPath("keyboard-up-geometry.json");
    writeFileSync(geometryPath, JSON.stringify(keyboardUpGeometry, null, 2));
    await testInfo.attach("keyboard-up.png", { path: shotPath, contentType: "image/png" });
    await testInfo.attach("keyboard-up-geometry.json", {
      path: geometryPath,
      contentType: "application/json",
    });
  });

  test("a pan iOS refuses to undo is followed, keeping the header and bar on screen", async ({
    page,
  }) => {
    await openLongNote(page);
    await tapLowerHalf(page);
    await page.evaluate(() => {
      (window as unknown as FakeViewport).__vv.refuseUnpan = true;
    });
    await keyboardUp(page, 120);
    await expect.poll(() => pan(page)).toBe(120);
    await expect.poll(() => screenTop(page, ".mm-topbar")).toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => Math.abs((await screenBottom(page, ".mm-accessory")) - (VISIBLE - URL_PILL_CLEARANCE)))
      .toBeLessThanOrEqual(1);
  });

  test("with a hardware keyboard the bar settles at the bottom instead of floating", async ({
    page,
  }) => {
    await openLongNote(page);
    await tapLowerHalf(page);
    // No software keyboard ever arrives: the prediction expires (1.5s).
    await expect
      .poll(async () => (await box(page, ".mm-accessory")).bottom, { timeout: 5000 })
      .toBe(H);
    await expect(page.locator(".mm-bottombar")).toHaveCount(0);
  });
});

test.describe("Android Chrome", () => {
  test.use({
    viewport: { width: 412, height: H },
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_CHROME,
    contextOptions: { reducedMotion: "reduce" },
  });

  test("the formatting bar sits flush on the keyboard (no URL pill)", async ({ page }) => {
    await openLongNote(page);
    await page.touchscreen.tap(206, 640);
    await expect(page.locator(".mm-accessory")).toBeVisible();
    await keyboardUp(page);
    await expect
      .poll(async () => Math.abs((await box(page, ".mm-accessory")).bottom - VISIBLE))
      .toBeLessThanOrEqual(1);
  });
});
