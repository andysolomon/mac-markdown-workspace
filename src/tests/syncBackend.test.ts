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
});
