import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { browserApi } from "../web/browserApi";
import { createLocalNotesPort } from "../services/localNotesPort";
import { syncVault, createVault, packSnapshot, type VaultTransport } from "../services/vaultSync";
import {
  deriveVaultKeys,
  decryptSnapshot,
  type VaultEnvelope,
} from "../services/vaultCrypto";

/* The web shim is a module singleton holding one cached IDB connection, so we
   can't hand it a fresh DB mid-test — each test uses distinct note ids and the
   two-device round-trip is proven with in-memory fakes in vaultSync.test.ts.
   Here we prove the REAL shim persists updatedAt + tombstones through IndexedDB
   and satisfies the port well enough to propagate a deletion into the vault. */
globalThis.indexedDB = new IDBFactory();

const KDF_TIMEOUT = 60_000;

function fakeTransport(): VaultTransport & {
  vaults: Map<string, { envelope: VaultEnvelope | null; rev: number }>;
} {
  const vaults = new Map<string, { envelope: VaultEnvelope | null; rev: number }>();
  return {
    vaults,
    createVault: async ({ vaultId }) => void vaults.set(vaultId, { envelope: null, rev: 0 }),
    getSnapshot: async (id) => {
      const v = vaults.get(id);
      return v?.envelope ? { envelope: v.envelope, etag: String(v.rev) } : null;
    },
    putSnapshot: async (id, _t, envelope) => {
      const v = vaults.get(id) ?? { envelope: null, rev: 0 };
      v.envelope = envelope;
      v.rev++;
      vaults.set(id, v);
    },
  };
}

describe("browserApi notes shim", () => {
  it("writeNote preserves a supplied updatedAt and stamps now when omitted", async () => {
    const before = Date.now();
    const pulled = await browserApi.writeNote({ id: "w-pulled", body: "x", updatedAt: 12345 });
    expect(pulled.updatedAt).toBe(12345);
    const local = await browserApi.writeNote({ id: "w-local", body: "y" });
    expect(local.updatedAt).toBeGreaterThanOrEqual(before);
    // Round-trips through listNotes verbatim.
    const notes = await browserApi.listNotes();
    expect(notes.find((n) => n.id === "w-pulled")?.updatedAt).toBe(12345);
  });

  it("records, lists, and clears tombstones", async () => {
    await browserApi.recordTombstone({ id: "t-1", deletedAt: 100 });
    await browserApi.recordTombstone({ id: "t-2", deletedAt: 200 });
    let tombs = await browserApi.listTombstones();
    expect(tombs.find((t) => t.id === "t-1")?.deletedAt).toBe(100);
    expect(tombs.map((t) => t.id).sort()).toContain("t-2");

    await browserApi.clearTombstones({ ids: ["t-1"] });
    tombs = await browserApi.listTombstones();
    expect(tombs.some((t) => t.id === "t-1")).toBe(false);
    expect(tombs.some((t) => t.id === "t-2")).toBe(true);
  });

  it("writeNote drops a stale tombstone for the same id (resurrection)", async () => {
    await browserApi.recordTombstone({ id: "r-1", deletedAt: 100 });
    await browserApi.writeNote({ id: "r-1", body: "back", updatedAt: 500 });
    const tombs = await browserApi.listTombstones();
    expect(tombs.some((t) => t.id === "r-1")).toBe(false);
  });

  it(
    "satisfies the LocalNotesPort contract: a local delete propagates into the vault",
    async () => {
      // Bind the shim as window.appApi so the real adapter is exercised too.
      (window as unknown as { appApi: typeof browserApi }).appApi = browserApi;
      const port = createLocalNotesPort();
      const transport = fakeTransport();
      // Seed a pre-existing remote vault holding e2e-n1 + e2e-n2.
      const { vaultId } = await createVault(
        "browser-e2e-pass",
        {
          listNotes: async () => [
            { id: "e2e-n1", body: "keep", updatedAt: 1000 },
            { id: "e2e-n2", body: "delete me", updatedAt: 1000 },
          ],
          writeNote: async (n) => ({ ...n, updatedAt: n.updatedAt }),
          deleteNote: async () => undefined,
          listTombstones: async () => [],
          clearTombstones: async () => undefined,
        },
        transport,
        1000,
      );

      // The real shim pulls the vault, then the user deletes e2e-n2.
      await syncVault("browser-e2e-pass", vaultId, port, transport, 1500);
      const pulled = await browserApi.listNotes();
      expect(pulled.find((n) => n.id === "e2e-n2")?.updatedAt).toBe(1000); // verbatim
      await browserApi.deleteNote({ id: "e2e-n2" });
      await browserApi.recordTombstone({ id: "e2e-n2", deletedAt: 2000 });

      // Syncing pushes the deletion and clears the local tombstone.
      await syncVault("browser-e2e-pass", vaultId, port, transport, 2000);
      expect((await browserApi.listNotes()).some((n) => n.id === "e2e-n2")).toBe(false);
      expect(await browserApi.listTombstones()).toHaveLength(0);

      // The pushed snapshot carries the tombstone, so other devices won't
      // resurrect it — decrypt the vault and confirm.
      const keys = deriveVaultKeys("browser-e2e-pass", vaultId);
      const snap = transport.vaults.get(vaultId)?.envelope;
      expect(snap).toBeTruthy();
      const remote = JSON.parse(
        await decryptSnapshot(keys.encryptionKey, vaultId, snap as VaultEnvelope),
      ) as ReturnType<typeof packSnapshot>;
      expect(remote.deletedIds).toContain("e2e-n2");
      expect(remote.notes.some((n) => n.id === "e2e-n2")).toBe(false);
    },
    KDF_TIMEOUT,
  );
});
