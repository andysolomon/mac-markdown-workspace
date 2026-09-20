import { test, expect, type Page, type Route } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launchApp } from "./helpers";

/**
 * Ambient vault sync (docs/ambient-vault-sync.md) end to end, against a
 * stubbed vault API. The stub is a faithful in-memory copy of
 * api/_lib/vaultStore.ts semantics — ETag-conditional PUT/GET, 304 on
 * X-Vault-If-None-Match, single-use pairing codes — intercepted at the
 * renderer via page.route, so everything below the transport is the real
 * client stack: scrypt, AES-GCM, the merge engine, resident keys, the
 * scheduler, and the modal.
 *
 * Two Electron instances play two devices. Notes go to isolated HOMEs.
 */

const API = "https://mac-markdown-workspace.vercel.app/api/vault";
const PASSPHRASE = "correct horse battery staple";

async function makeIsolatedHome(tag: string) {
  const home = await mkdtemp(path.join(os.tmpdir(), `mmw-sync-${tag}-`));
  const userData = path.join(home, "config");
  await mkdir(path.join(home, "Documents"), { recursive: true });
  await mkdir(path.join(home, ".config"), { recursive: true });
  await mkdir(userData, { recursive: true });
  await writeFile(
    path.join(home, ".config", "user-dirs.dirs"),
    'XDG_DOCUMENTS_DIR="$HOME/Documents"\n',
    "utf8",
  );
  return { userData, env: { HOME: home, XDG_CONFIG_HOME: path.join(home, ".config") } };
}

/** In-memory vault API shared by every window in the test. */
function createVaultStub() {
  const vaults = new Map<string, { snapshot: { body: string; etag: string } | null; version: number }>();
  const pairings = new Map<string, { vaultId: string; expiresAt: number }>();
  const log: Array<{ method: string; path: string; status: number; headers: Record<string, string> }> = [];

  const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({
      status,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  const handler = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const rel = url.pathname.replace(/^\/api\/vault/, "");
    const method = req.method();
    const headers = Object.fromEntries(
      Object.entries(req.headers()).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const record = (status: number) => log.push({ method, path: rel, status, headers });
    const body = (): Record<string, unknown> => {
      try {
        return JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    if (method === "OPTIONS") {
      record(204);
      return route.fulfill({ status: 204 });
    }
    if (rel === "" && method === "POST") {
      const { vaultId } = body() as { vaultId: string };
      if (vaults.has(vaultId)) {
        record(409);
        return json(route, 409, { error: "exists" });
      }
      vaults.set(vaultId, { snapshot: null, version: 0 });
      record(201);
      return json(route, 201, { vaultId });
    }
    if (rel === "/pair" && method === "POST") {
      if (!headers.authorization?.startsWith("Bearer ")) {
        record(401);
        return json(route, 401, { error: "no token" });
      }
      const { vaultId } = body() as { vaultId: string };
      const code = "K7F2M9QX";
      pairings.set(code, { vaultId, expiresAt: Date.now() + 600_000 });
      record(201);
      return json(route, 201, { code, expiresAt: Date.now() + 600_000 });
    }
    if (rel === "/pair/redeem" && method === "POST") {
      const { code } = body() as { code: string };
      const pairing = pairings.get(code);
      pairings.delete(code); // single use
      if (!pairing || pairing.expiresAt < Date.now()) {
        record(404);
        return json(route, 404, { error: "Unknown pairing code" });
      }
      record(200);
      return json(route, 200, { vaultId: pairing.vaultId });
    }
    const m = rel.match(/^\/([^/]+)\/snapshot$/);
    if (m) {
      const vault = vaults.get(m[1]);
      if (!vault) {
        record(404);
        return json(route, 404, { error: "no vault" });
      }
      if (method === "GET") {
        if (!vault.snapshot) {
          record(404);
          return json(route, 404, { error: "No snapshot" });
        }
        const inm = headers["x-vault-if-none-match"];
        if (inm && inm !== "*" && inm === vault.snapshot.etag) {
          record(304);
          return route.fulfill({ status: 304, headers: { etag: vault.snapshot.etag } });
        }
        record(200);
        return route.fulfill({
          status: 200,
          headers: { "content-type": "application/json", etag: vault.snapshot.etag },
          body: vault.snapshot.body,
        });
      }
      if (method === "PUT") {
        if (!headers.authorization?.startsWith("Bearer ")) {
          record(401);
          return json(route, 401, { error: "no token" });
        }
        const ifMatch = headers["x-vault-if-match"];
        const ifNone = headers["x-vault-if-none-match"];
        if (ifNone === "*" && vault.snapshot) {
          record(412);
          return json(route, 412, { error: "exists" });
        }
        if (ifMatch && vault.snapshot?.etag !== ifMatch) {
          record(412);
          return json(route, 412, { error: "changed" });
        }
        const etag = `"v${++vault.version}"`;
        vault.snapshot = { body: req.postData() ?? "", etag };
        record(200);
        return json(route, 200, { ok: true }, { etag });
      }
    }
    record(405);
    return json(route, 405, { error: "nope" });
  };

  return {
    log,
    vaults,
    attach: (page: Page) => page.route(`${API}/**`, handler).then(() => page.route(API, handler)),
    puts: () => log.filter((e) => e.method === "PUT" && e.status === 200).length,
  };
}

async function openSyncModal(window: Page) {
  await window.getByRole("button", { name: "Settings" }).click();
  await window.getByRole("button", { name: /Set up sync|Manage sync/ }).click();
  await expect(window.getByRole("dialog", { name: "Cloud Sync" })).toBeVisible();
}

test.describe("Ambient vault sync", () => {
  test.setTimeout(120_000);

  test("enable → remember → background push → pair → link → pull → 304 poll → restart without passphrase", async () => {
    const stub = createVaultStub();

    // ---- Device A: enable sync, remembering the device -------------------
    const a = await makeIsolatedHome("a");
    let appA = await launchApp({ args: [`--user-data-dir=${a.userData}`], env: a.env });
    let winA = await appA.firstWindow();
    await stub.attach(winA);
    await winA.waitForLoadState("domcontentloaded");
    await expect(winA.locator(".mm-doclist")).toBeVisible();
    // Sync is off: the chrome carries no indicator at all.
    await expect(winA.getByTestId("sync-indicator")).toHaveCount(0);

    await openSyncModal(winA);
    await winA.getByRole("button", { name: "Enable sync" }).click();
    await winA.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
    await winA.getByLabel("Confirm passphrase").fill(PASSPHRASE);
    const remember = winA.getByRole("checkbox", { name: /Remember this device/ });
    await expect(remember).toBeEnabled();
    await expect(remember).toBeChecked();
    await winA.getByRole("button", { name: "Create vault" }).click();

    // scrypt + the initial upload; the manage view then reports status.
    await expect(winA.getByRole("button", { name: "Pair a device" })).toBeVisible({ timeout: 30_000 });
    expect(stub.puts()).toBe(1);
    const vaultId = [...stub.vaults.keys()][0];
    expect(vaultId).toMatch(/^vlt_/);
    await expect(winA.getByTestId("sync-indicator")).toHaveAttribute("data-status", "idle", {
      timeout: 15_000,
    });

    // ---- Pair a device: an 8-char code, not the vault id ------------------
    await winA.getByRole("button", { name: "Pair a device" }).click();
    const codeEl = winA.getByTestId("pairing-code");
    await expect(codeEl).toBeVisible({ timeout: 15_000 });
    const shownCode = (await codeEl.textContent())?.trim() ?? "";
    expect(shownCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(shownCode).not.toContain("vlt_");
    await expect(winA.getByText(/Expires in \d+:\d{2}/)).toBeVisible();
    const pairCall = stub.log.find((e) => e.path === "/pair");
    expect(pairCall?.headers.authorization).toMatch(/^Bearer [0-9a-f]{64}$/);
    await winA.getByRole("button", { name: "Done" }).click();
    await winA.getByRole("button", { name: "Close" }).click();

    // ---- Edit a note; the loop pushes after the debounce, unprompted ------
    const putsBefore = stub.puts();
    await winA.locator(".cm-content").click();
    await winA.keyboard.press("End");
    await winA.keyboard.type("\n\nambient edit from device A");
    await expect(winA.getByRole("dialog")).toHaveCount(0); // nothing prompted
    await expect.poll(() => stub.puts(), { timeout: 30_000 }).toBeGreaterThan(putsBefore);
    await expect(winA.getByTestId("sync-indicator")).toHaveAttribute("data-status", "idle", {
      timeout: 15_000,
    });
    const pushed = stub.log.filter((e) => e.method === "PUT" && e.status === 200).pop();
    expect(pushed?.headers["x-vault-if-match"]).toBeTruthy(); // optimistic concurrency held

    // ---- Device B: link with the pairing code + passphrase ----------------
    const b = await makeIsolatedHome("b");
    const appB = await launchApp({ args: [`--user-data-dir=${b.userData}`], env: b.env });
    const winB = await appB.firstWindow();
    await stub.attach(winB);
    await winB.waitForLoadState("domcontentloaded");
    await expect(winB.locator(".mm-doclist")).toBeVisible();

    await openSyncModal(winB);
    await winB.getByRole("button", { name: "I have a pairing code" }).click();
    await winB.getByLabel("Pairing code").fill(shownCode.toLowerCase()); // case-insensitive, hyphen ok
    await winB.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
    await winB.getByRole("button", { name: "Link device" }).click();

    // A successful link closes the modal; surface the modal's own error
    // text if it didn't, instead of a bare timeout.
    try {
      await expect(winB.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    } catch (error) {
      const message = await winB.locator(".mm-sync-error").textContent().catch(() => null);
      throw new Error(`Link device did not complete${message ? `: ${message}` : ""}`, { cause: error });
    }
    expect(stub.log.some((e) => e.path === "/pair/redeem" && e.status === 200)).toBe(true);
    // B seeded its own welcome note (newer, so it sorts first); A's edited
    // note was pulled in beside it under the same title. The list shows
    // title + first line only, so open the OTHER row and read the editor.
    await expect(winB.locator(".mm-doc-row")).toHaveCount(2, { timeout: 15_000 });
    await winB.locator(".mm-doc-row").nth(1).click();
    await expect(winB.locator(".cm-content")).toContainText("ambient edit from device A");
    await expect(winB.getByTestId("sync-indicator")).toHaveAttribute("data-status", "idle", {
      timeout: 15_000,
    });

    // The code was single-use: a second redeem is refused.
    const redeemAgain = await winB.evaluate(
      async ([api, code]) => {
        const res = await fetch(`${api}/pair/redeem`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        });
        return res.status;
      },
      [API, shownCode] as const,
    );
    expect(redeemAgain).toBe(404);

    // ---- Conditional poll: coming back to the window costs a 304 ---------
    const threeOhFoursBefore = stub.log.filter((e) => e.status === 304).length;
    await winB.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect
      .poll(() => stub.log.filter((e) => e.status === 304).length, { timeout: 15_000 })
      .toBeGreaterThan(threeOhFoursBefore);
    const poll = stub.log.filter((e) => e.status === 304).pop();
    expect(poll?.headers["x-vault-if-none-match"]).toMatch(/^"v\d+"$/);

    await appB.close();

    // ---- Device A restarts: resident keys, no passphrase, straight to idle -
    await appA.close();
    appA = await launchApp({ args: [`--user-data-dir=${a.userData}`], env: a.env });
    winA = await appA.firstWindow();
    await stub.attach(winA);
    await winA.waitForLoadState("domcontentloaded");
    await expect(winA.locator(".mm-doclist")).toBeVisible();
    await expect(winA.getByTestId("sync-indicator")).toHaveAttribute("data-status", "idle", {
      timeout: 20_000,
    });
    await expect(winA.getByRole("dialog")).toHaveCount(0);

    // Turning sync off forgets the keys: the next launch is "off", not "idle".
    await openSyncModal(winA);
    await winA.getByRole("button", { name: "Turn off sync" }).click();
    await expect(winA.getByRole("button", { name: "Enable sync" })).toBeVisible();
    await winA.getByRole("button", { name: "Close" }).click();
    await expect(winA.getByTestId("sync-indicator")).toHaveCount(0);
    await appA.close();
  });
});
