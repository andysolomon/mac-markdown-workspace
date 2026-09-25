import { describe, it, expect, vi, afterEach } from "vitest";
import { createHttpVaultTransport } from "../services/vaultHttpTransport";
import { VaultConflictError } from "../services/vaultSync";
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
