import { describe, it, expect, vi } from "vitest";
import { createVaultSyncBackend } from "../services/syncBackend";
import {
  encryptSnapshot,
  type VaultEnvelope,
} from "../services/vaultCrypto";
import type { LocalNotesPort, VaultTransport } from "../services/vaultSync";

const VAULT = "vlt_123e4567-e89b-12d3-a456-426614174000";
const RAW = new Uint8Array(32).map((_, i) => 7 * i + 1);

function fakeLocal(): LocalNotesPort {
  return {
    listNotes: async () => [],
    writeNote: async ({ id, body, updatedAt }) => ({ id, body, updatedAt }),
    deleteNote: async () => undefined,
    listTombstones: async () => [],
    clearTombstones: async () => undefined,
  };
}

async function remoteEnvelope(): Promise<VaultEnvelope> {
  return encryptSnapshot(
    RAW,
    VAULT,
    JSON.stringify({ version: 1, notes: [], deletedIds: [], syncedAt: 1 }),
  );
}

describe("vault SyncBackend", () => {
  it("polls conditionally with the etag it learned and reports notModified on 304", async () => {
    const envelope = await remoteEnvelope();
    const getSnapshot = vi.fn(async (_id: string, opts?: { ifNoneMatch?: string }) => {
      if (opts?.ifNoneMatch === '"v1"') return { notModified: true as const, etag: '"v1"' };
      return { envelope, etag: '"v1"' };
    });
    const transport: VaultTransport = {
      createVault: async () => undefined,
      getSnapshot,
      putSnapshot: async () => ({ etag: '"v2"' }),
    };
    const backend = createVaultSyncBackend({
      vaultId: VAULT,
      keys: { encryptionKey: RAW, writeToken: "t" },
      local: fakeLocal(),
      transport,
    });

    // First poll has no etag yet: unconditional, learns "v1".
    const first = await backend.converge("pull-if-changed");
    expect(first.notModified).toBe(false);
    expect(getSnapshot.mock.calls[0][1]).toBeUndefined();

    // Second poll is conditional and short-circuits.
    const second = await backend.converge("pull-if-changed");
    expect(second).toEqual({ pulled: 0, pushed: false, notModified: true });
    expect(getSnapshot.mock.calls[1][1]).toEqual({ ifNoneMatch: '"v1"' });

    // A full cycle is never conditional.
    await backend.converge("full");
    expect(getSnapshot.mock.calls[2][1]).toBeUndefined();
  });

  it("uses the etag a push returned for the next poll", async () => {
    const envelope = await remoteEnvelope();
    const seen: Array<string | undefined> = [];
    const transport: VaultTransport = {
      createVault: async () => undefined,
      getSnapshot: async (_id, opts) => {
        seen.push(opts?.ifNoneMatch);
        if (opts?.ifNoneMatch === '"v2"') return { notModified: true, etag: '"v2"' };
        return { envelope, etag: '"v1"' };
      },
      putSnapshot: async () => ({ etag: '"v2"' }),
    };
    const local = fakeLocal();
    local.listNotes = async () => [{ id: "n1", body: "new local note", updatedAt: 5 }];
    const backend = createVaultSyncBackend({
      vaultId: VAULT,
      keys: { encryptionKey: RAW, writeToken: "t" },
      local,
      transport,
    });
    const pushed = await backend.converge("full");
    expect(pushed.pushed).toBe(true);
    const poll = await backend.converge("pull-if-changed");
    expect(poll.notModified).toBe(true);
    expect(seen).toEqual([undefined, '"v2"']);
  });

  it("mints pairing codes through the transport with the write token", async () => {
    const createPairing = vi.fn(async () => ({ code: "K7F2M9QX", expiresAt: 9 }));
    const backend = createVaultSyncBackend({
      vaultId: VAULT,
      keys: { encryptionKey: RAW, writeToken: "write-me" },
      local: fakeLocal(),
      transport: {
        createVault: async () => undefined,
        getSnapshot: async () => null,
        putSnapshot: async () => undefined,
        createPairing,
      },
    });
    await expect(backend.createPairing?.()).resolves.toEqual({ code: "K7F2M9QX", expiresAt: 9 });
    expect(createPairing).toHaveBeenCalledWith(VAULT, "write-me");
  });
});
