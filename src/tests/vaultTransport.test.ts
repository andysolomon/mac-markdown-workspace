import { describe, it, expect, vi, afterEach } from "vitest";
import { createHttpVaultTransport } from "../services/vaultHttpTransport";
import { VaultConflictError, isNotModified, type RemoteSnapshot } from "../services/vaultSync";
import {
  isValidVaultId,
  isValidTokenHash,
  isValidEnvelope,
  writeTokenMatches,
} from "../../api/_lib/vaultStore";
import { createHash } from "node:crypto";

const VAULT_ID = "vlt_123e4567-e89b-12d3-a456-426614174000";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vaultHttpTransport", () => {
  it("createVault POSTs id + hash and surfaces failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { vaultId: VAULT_ID }));
    vi.stubGlobal("fetch", fetchMock);
    const t = createHttpVaultTransport("https://example.test");
    await t.createVault({ vaultId: VAULT_ID, writeTokenHash: "ab".repeat(32) });

    const [reqUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reqUrl).toBe("https://example.test/api/vault");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string).vaultId).toBe(VAULT_ID);

    fetchMock.mockResolvedValue(jsonResponse(409, { error: "exists" }));
    await expect(
      t.createVault({ vaultId: VAULT_ID, writeTokenHash: "ab".repeat(32) }),
    ).rejects.toThrow(/already exists/);
  });

  it("getSnapshot returns envelope + etag, null on 404", async () => {
    const envelope = { v: 1, nonce: "bm9uY2U=", ct: "Y3Q=" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, envelope, { etag: '"rev-7"' }))
      .mockResolvedValueOnce(jsonResponse(404, { error: "none" }));
    vi.stubGlobal("fetch", fetchMock);
    const t = createHttpVaultTransport();

    const snap = await t.getSnapshot(VAULT_ID);
    expect(isNotModified(snap)).toBe(false);
    expect((snap as RemoteSnapshot).envelope).toEqual(envelope);
    expect(snap?.etag).toBe('"rev-7"');
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/vault/${VAULT_ID}/snapshot`);

    await expect(t.getSnapshot(VAULT_ID)).resolves.toBeNull();
  });

  it("putSnapshot maps ifMatch semantics onto conditional headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const t = createHttpVaultTransport();
    const envelope = { v: 1 as const, nonce: "bm9uY2U=", ct: "Y3Q=" };

    await t.putSnapshot(VAULT_ID, "token", envelope, { ifMatch: '"rev-7"' });
    await t.putSnapshot(VAULT_ID, "token", envelope, { ifMatch: null });
    await t.putSnapshot(VAULT_ID, "token", envelope);

    const headersOf = (i: number) => (fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>;
    expect(headersOf(0)["x-vault-if-match"]).toBe('"rev-7"');
    expect(headersOf(0).authorization).toBe("Bearer token");
    expect(headersOf(1)["x-vault-if-none-match"]).toBe("*");
    expect(headersOf(1)["x-vault-if-match"]).toBeUndefined();
    expect(headersOf(2)["x-vault-if-match"]).toBeUndefined();
    expect(headersOf(2)["x-vault-if-none-match"]).toBeUndefined();
  });

  it("putSnapshot maps each status to the right error and never loops on non-412", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(412, { error: "conflict" }))
      .mockResolvedValueOnce(jsonResponse(403, { error: "bad token" }))
      .mockResolvedValueOnce(jsonResponse(413, { error: "too big" }))
      .mockResolvedValueOnce(jsonResponse(404, { error: "gone" }));
    vi.stubGlobal("fetch", fetchMock);
    const t = createHttpVaultTransport();
    const envelope = { v: 1 as const, nonce: "bm9uY2U=", ct: "Y3Q=" };

    await expect(t.putSnapshot(VAULT_ID, "t", envelope)).rejects.toBeInstanceOf(
      VaultConflictError,
    );
    await expect(t.putSnapshot(VAULT_ID, "t", envelope)).rejects.toThrow(/write token/);
    await expect(t.putSnapshot(VAULT_ID, "t", envelope)).rejects.toThrow(/too large/);
    await expect(t.putSnapshot(VAULT_ID, "t", envelope)).rejects.toThrow(/no longer exists/);
  });
});

describe("vaultHttpTransport — ambient sync surface", () => {
  it("getSnapshot sends X-Vault-If-None-Match and maps 304 to notModified", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { etag: '"rev-7"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = createHttpVaultTransport();

    const a = await t.getSnapshot(VAULT_ID, { ifNoneMatch: '"rev-7"' });
    expect(isNotModified(a)).toBe(true);
    expect(a?.etag).toBe('"rev-7"');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-vault-if-none-match"]).toBe('"rev-7"');

    // No ETag header on the 304: fall back to the tag we asked about.
    const b = await t.getSnapshot(VAULT_ID, { ifNoneMatch: '"rev-8"' });
    expect(isNotModified(b) && b.etag).toBe('"rev-8"');
  });

  it("an unconditional getSnapshot never sends the conditional header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { v: 1, nonce: "bm9uY2U=", ct: "Y3Q=" }, { etag: '"rev-1"' }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await createHttpVaultTransport().getSnapshot(VAULT_ID);
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-vault-if-none-match"]).toBeUndefined();
  });

  it("putSnapshot resolves the new ETag so the next poll can be conditional", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }, { etag: '"rev-9"' })));
    const result = await createHttpVaultTransport().putSnapshot(VAULT_ID, "t", {
      v: 1,
      nonce: "bm9uY2U=",
      ct: "Y3Q=",
    });
    expect(result).toEqual({ etag: '"rev-9"' });
  });

  it("createPairing POSTs the vault id with the write token and returns the code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { code: "K7F2M9QX", expiresAt: 123 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = createHttpVaultTransport("https://example.test");
    const pairing = await t.createPairing?.(VAULT_ID, "token");
    expect(pairing).toEqual({ code: "K7F2M9QX", expiresAt: 123 });
    const [reqUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reqUrl).toBe("https://example.test/api/vault/pair");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer token");
    expect(JSON.parse(init.body as string)).toEqual({ vaultId: VAULT_ID });

    fetchMock.mockResolvedValue(jsonResponse(403, { error: "bad" }));
    await expect(t.createPairing?.(VAULT_ID, "token")).rejects.toThrow(/write token/);
  });

  it("redeemPairing returns the vault id and explains a dead code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { vaultId: VAULT_ID }))
      .mockResolvedValueOnce(jsonResponse(404, { error: "Unknown pairing code" }));
    vi.stubGlobal("fetch", fetchMock);
    const t = createHttpVaultTransport();
    await expect(t.redeemPairing?.("K7F2M9QX")).resolves.toEqual({ vaultId: VAULT_ID });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/vault/pair/redeem");
    await expect(t.redeemPairing?.("K7F2M9QX")).rejects.toThrow(/ten minutes/);
  });
});

describe("api vault validation helpers", () => {
  it("accepts only vlt_<uuid> vault ids", () => {
    expect(isValidVaultId(VAULT_ID)).toBe(true);
    expect(isValidVaultId("vlt_not-a-uuid")).toBe(false);
    expect(isValidVaultId(`../${VAULT_ID}`)).toBe(false);
    expect(isValidVaultId(undefined)).toBe(false);
    expect(isValidVaultId([VAULT_ID])).toBe(false); // query params can be arrays
  });

  it("accepts only 64-hex token hashes and well-formed v1 envelopes", () => {
    expect(isValidTokenHash("ab".repeat(32))).toBe(true);
    expect(isValidTokenHash("AB".repeat(32))).toBe(false);
    expect(isValidTokenHash("ab".repeat(31))).toBe(false);
    expect(isValidEnvelope({ v: 1, nonce: "bm9uY2U=", ct: "Y3Q=" })).toBe(true);
    expect(isValidEnvelope({ v: 2, nonce: "bm9uY2U=", ct: "Y3Q=" })).toBe(false);
    expect(isValidEnvelope({ v: 1, nonce: 3, ct: "Y3Q=" })).toBe(false);
    expect(isValidEnvelope(null)).toBe(false);
    // Reject markup / non-base64 in ct (the XSS vector) and extra keys.
    expect(isValidEnvelope({ v: 1, nonce: "bm9uY2U=", ct: "</x><script>alert(1)</script>" })).toBe(
      false,
    );
    expect(isValidEnvelope({ v: 1, nonce: "bm9uY2U=", ct: "Y3Q=", extra: "x" })).toBe(false);
    expect(isValidEnvelope({ v: 1, nonce: "", ct: "Y3Q=" })).toBe(false);
  });

  it("matches write tokens against their stored hash in constant time", () => {
    const token = "deadbeef".repeat(8);
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    expect(writeTokenMatches(token, hash)).toBe(true);
    expect(writeTokenMatches("wrong-token", hash)).toBe(false);
    expect(writeTokenMatches(token, "zz-not-hex")).toBe(false);
    expect(writeTokenMatches(token, "abcd")).toBe(false); // truncated hash
  });
});
