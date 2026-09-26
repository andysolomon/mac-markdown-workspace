import { writeFileSync } from "node:fs";
import { expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * Swipe-to-delete on the phone note list (`--project=web`).
 *
 * Scrolling the list must never reveal a row's Delete action: a thumb flick
 * drifts sideways, and that drift used to slide the row and snap Delete open
 * (two rows at once, mid-scroll). Only a deliberate sideways swipe reveals
 * Delete, one row at a time, and scrolling puts an open row away.
 *
 * Touches are real touch input dispatched through CDP, so Chromium runs its
 * own scroll gesture off them — the handlers see what a phone would send.
 *
 * Artifact: a screenshot and a JSON snapshot (list scroll + every row's
 * horizontal offset) right after the drifting scroll, from 30 fixed notes in
 * a fresh context at a fixed iPhone viewport.
 */

const W = 402;
const H = 874; // iPhone 16 Pro, points
const REVEAL = 84; // the Delete action's width

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

const NOTES = Array.from(
  { length: 30 },
  (_, i) => `# Note ${String(i + 1).padStart(2, "0")}\n\nBody of note ${i + 1}, long enough for a preview line.`,
);

test.use({
  viewport: { width: W, height: H },
  isMobile: true,
  hasTouch: true,
  userAgent: IPHONE_SAFARI,
});

async function openSeededList(page: Page) {
  await page.goto("/");
  await expect(page.locator(".mm-doc-row").first()).toBeVisible();
  await page.evaluate(async (bodies) => {
    const api = (window as unknown as { appApi: { createNote(p: { body: string }): Promise<unknown> } }).appApi;
    for (const body of bodies) await api.createNote({ body });
  }, NOTES);
  await page.reload();
  await expect(page.locator(".mm-doc-row")).toHaveCount(NOTES.length + 1);
}

type Point = { x: number; y: number };

/** One finger: down at `from`, moved in even steps to `to`, then lifted. */
async function drag(cdp: CDPSession, from: Point, to: Point, opts: { lift?: boolean } = {}) {
  const steps = 20;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
    });
  }
  if (opts.lift !== false) await lift(cdp);
}

async function lift(cdp: CDPSession) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Every row's horizontal offset from its slot (0 = closed, -84 = Delete shown). */
function rowOffsets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".mm-doc-swipe")].map((slot) => {
      const row = slot.querySelector(".mm-doc-row");
      return Math.round((row?.getBoundingClientRect().left ?? 0) - slot.getBoundingClientRect().left);
    }),
  );
}

function listScrollTop(page: Page) {
  return page.evaluate(() => document.querySelector(".mm-doclist .mm-scroll")?.scrollTop ?? -1);
}

/** Vertical centre of the nth row currently in the list. */
async function rowCenterY(page: Page, index: number) {
  const box = await page.locator(".mm-doc-row").nth(index).boundingBox();
  if (!box) throw new Error(`row ${index} is not rendered`);
  return box.y + box.height / 2;
}

/** Whether a tap at the right edge of row `index` would land on its Delete button. */
function deleteIsExposed(page: Page, index: number) {
  return page.evaluate((i) => {
    const slot = document.querySelectorAll(".mm-doc-swipe")[i];
    const r = slot.getBoundingClientRect();
    const hit = document.elementFromPoint(r.right - 20, r.top + r.height / 2);
    return !!hit?.closest(".mm-swipe-delete");
  }, index);
}

test("scrolling the list with a thumb that drifts sideways never reveals Delete", async ({
  page,
}, testInfo) => {
  await openSeededList(page);
  const cdp = await page.context().newCDPSession(page);

  // A real thumb flick: 480pt up while drifting 70pt left — well past the
  // halfway point that snaps Delete open. Sample mid-gesture, finger still down.
  const y = await rowCenterY(page, 5);
  await drag(cdp, { x: 330, y }, { x: 260, y: y - 480 }, { lift: false });
  expect(await rowOffsets(page)).toEqual(Array(NOTES.length + 1).fill(0));
  await lift(cdp);

  await expect.poll(() => listScrollTop(page)).toBeGreaterThan(200);
  await page.waitForTimeout(300); // any snap animation would have settled
  expect(await rowOffsets(page)).toEqual(Array(NOTES.length + 1).fill(0));

  // A shorter, slower scroll back down with drift the other way round.
  const y2 = await rowCenterY(page, 12);
  await drag(cdp, { x: 300, y: y2 - 200 }, { x: 250, y: y2 });
  await page.waitForTimeout(300);
  expect(await rowOffsets(page)).toEqual(Array(NOTES.length + 1).fill(0));

  const shotPath = testInfo.outputPath("list-after-drifting-scroll.png");
  await page.screenshot({ path: shotPath });
  const snapshotPath = testInfo.outputPath("list-after-drifting-scroll.json");
  writeFileSync(
    snapshotPath,
    JSON.stringify({ viewport: { width: W, height: H }, scrollTop: await listScrollTop(page), rowOffsets: await rowOffsets(page) }, null, 2),
  );
  await testInfo.attach("list-after-drifting-scroll.png", { path: shotPath, contentType: "image/png" });
  await testInfo.attach("list-after-drifting-scroll.json", { path: snapshotPath, contentType: "application/json" });
});

test("a deliberate swipe reveals Delete on one row at a time, and scrolling puts it away", async ({
  page,
}) => {
  await openSeededList(page);
  const cdp = await page.context().newCDPSession(page);
  const closed = Array(NOTES.length + 1).fill(0);
  const openAt = (i: number) => closed.map((_, j) => (j === i ? -REVEAL : 0));

  // A sideways swipe with a little natural wobble opens row 2...
  let y = await rowCenterY(page, 2);
  await drag(cdp, { x: 330, y }, { x: 210, y: y + 6 });
  await expect.poll(() => rowOffsets(page)).toEqual(openAt(2));
  expect(await deleteIsExposed(page, 2)).toBe(true);
  expect(await listScrollTop(page)).toBe(0); // ...without scrolling the list.

  // ...opening row 4 closes row 2 (never two Delete buttons at once)...
  y = await rowCenterY(page, 4);
  await drag(cdp, { x: 330, y }, { x: 210, y: y - 6 });
  await expect.poll(() => rowOffsets(page)).toEqual(openAt(4));

  // ...and scrolling the list closes it.
  y = await rowCenterY(page, 6);
  await drag(cdp, { x: 200, y }, { x: 200, y: y - 300 });
  await expect.poll(() => listScrollTop(page)).toBeGreaterThan(100);
  await expect.poll(() => rowOffsets(page)).toEqual(closed);
  expect(await deleteIsExposed(page, 4)).toBe(false);
});

test("Delete from a swipe asks first: dismissing keeps the note, confirming removes it", async ({
  page,
}) => {
  await openSeededList(page);
  const cdp = await page.context().newCDPSession(page);
  const row = page.locator(".mm-doc-swipe").nth(1);
  const title = (await row.locator(".mm-doc-row > div").first().textContent()) ?? "";
  expect(title).toMatch(/^Note \d\d$/);

  const swipeOpen = async () => {
    const y = await rowCenterY(page, 1);
    await drag(cdp, { x: 330, y }, { x: 210, y });
    await expect.poll(() => deleteIsExposed(page, 1)).toBe(true);
  };

  await swipeOpen();
  page.once("dialog", (d) => d.dismiss());
  await row.getByRole("button", { name: `Delete note: ${title}` }).first().tap();
  await expect(page.locator(".mm-doc-row", { hasText: title })).toHaveCount(1);
  await expect.poll(() => deleteIsExposed(page, 1)).toBe(false);

  await swipeOpen();
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: `Delete note: ${title}` }).first().tap();
  await expect(page.locator(".mm-doc-row", { hasText: title })).toHaveCount(0);
  await expect(page.locator(".mm-doc-row")).toHaveCount(NOTES.length);
});
