import { describe, it, expect } from "vitest";
import {
  deriveVaultKeys,
  encryptSnapshot,
  decryptSnapshot,
  importEncryptionKey,
  generateVaultId,
} from "../services/vaultCrypto";
import {
  mergeSnapshots,
  packSnapshot,
  createVault,
  syncVault,
  VaultConflictError,
  MIN_PASSPHRASE_LENGTH,
  type VaultSnapshot,
  type LocalNotesPort,
  type VaultTransport,
  syncVaultWithKeys,
  type RemoteSnapshot,
  type RemoteNotModified,
} from "../services/vaultSync";
import type { RawNote } from "../services/notesModel";
import type { VaultEnvelope } from "../services/vaultCrypto";

/* scrypt at production strength (N=2^17) costs real time per derivation, so
   anything touching deriveVaultKeys gets a generous timeout. */
const KDF_TIMEOUT = 60_000;

const note = (id: string, body: string, updatedAt: number): RawNote => ({ id, body, updatedAt });

interface FakeLocal extends LocalNotesPort {
  state: Map<string, RawNote>;
  tombstones: Map<string, number>;
  /** Simulates the app's delete flow: remove the note AND record a tombstone. */
  userDelete(id: string, deletedAt: number): void;
}

function fakeLocal(seed: RawNote[]): FakeLocal {
  const state = new Map(seed.map((n) => [n.id, { ...n }]));
  const tombstones = new Map<string, number>();
  return {
    state,
    tombstones,
    userDelete: (id, deletedAt) => {
      state.delete(id);
      tombstones.set(id, deletedAt);
    },
    listNotes: async () => [...state.values()],
    writeNote: async ({ id, body, updatedAt }) => {
      const n = { id, body, updatedAt };
      state.set(id, n);
      tombstones.delete(id);
      return n;
    },
    deleteNote: async ({ id }) => {
      state.delete(id);
    },
    listTombstones: async () => [...tombstones].map(([id, deletedAt]) => ({ id, deletedAt })),
    clearTombstones: async (ids) => {
      for (const id of ids) tombstones.delete(id);
    },
  };
}

interface FakeTransport extends VaultTransport {
  vaults: Map<string, { hash: string; envelope: VaultEnvelope | null; rev: number }>;
}

function fakeTransport(): FakeTransport {
  const vaults = new Map<string, { hash: string; envelope: VaultEnvelope | null; rev: number }>();
  return {
    vaults,
    createVault: async ({ vaultId, writeTokenHash }) => {
      vaults.set(vaultId, { hash: writeTokenHash, envelope: null, rev: 0 });
    },
    getSnapshot: async (vaultId) => {
      const v = vaults.get(vaultId);
      if (!v?.envelope) return null;
      return { envelope: v.envelope, etag: String(v.rev) };
    },
    putSnapshot: async (vaultId, _token, envelope, opts) => {
      const v = vaults.get(vaultId) ?? { hash: "", envelope: null, rev: 0 };
      const currentEtag = v.envelope ? String(v.rev) : null;
      if (opts?.ifMatch !== undefined && opts.ifMatch !== currentEtag) {
        throw new VaultConflictError();
      }
      v.envelope = envelope;
      v.rev++;
      vaults.set(vaultId, v);
    },
  };
}

describe("vaultCrypto", () => {
  it(
    "derives deterministic keys per (passphrase, vaultId) and never equal across vaults",
    () => {
      const a1 = deriveVaultKeys("correct horse", "vlt_a");
      const a2 = deriveVaultKeys("correct horse", "vlt_a");
      const b = deriveVaultKeys("correct horse", "vlt_b");
      expect(a1.writeToken).toBe(a2.writeToken);
      expect(a1.writeToken).not.toBe(b.writeToken);
      expect(a1.writeTokenHash).toHaveLength(64);
      expect(a1.writeTokenHash).not.toBe(a1.writeToken);
    },
    KDF_TIMEOUT,
  );

  it(
    "encrypts and decrypts a snapshot round-trip; wrong passphrase fails",
    async () => {
      const vaultId = generateVaultId();
      const keys = deriveVaultKeys("passphrase-1", vaultId);
      const plaintext = JSON.stringify(packSnapshot([note("a", "# Hi", 1)], [], 42));
      const envelope = await encryptSnapshot(keys.encryptionKey, vaultId, plaintext);
      expect(envelope.v).toBe(1);
      expect(envelope.ct).not.toContain("# Hi");

      const keys2 = deriveVaultKeys("passphrase-1", vaultId);
      await expect(decryptSnapshot(keys2.encryptionKey, vaultId, envelope)).resolves.toBe(
        plaintext,
      );

      const wrong = deriveVaultKeys("passphrase-2", vaultId);
      await expect(decryptSnapshot(wrong.encryptionKey, vaultId, envelope)).rejects.toThrow();
    },
    KDF_TIMEOUT,
  );

  it(
    "rejects tampered ciphertext and envelopes replayed into another vault",
    async () => {
      const vaultId = generateVaultId();
      const keys = deriveVaultKeys("passphrase-1", vaultId);
      const envelope = await encryptSnapshot(keys.encryptionKey, vaultId, "secret payload");

      // Bit-flip inside the ciphertext: GCM integrity must fail the decrypt.
      const flipped = envelope.ct.replace(/^./, (c) => (c === "A" ? "B" : "A"));
      await expect(
        decryptSnapshot(keys.encryptionKey, vaultId, { ...envelope, ct: flipped }),
      ).rejects.toThrow();

      // Same key, different vault id: AAD binding must fail the decrypt.
      await expect(decryptSnapshot(keys.encryptionKey, "vlt_other", envelope)).rejects.toThrow();
    },
    KDF_TIMEOUT,
  );

  it(
    "uses a fresh nonce per encryption",
    async () => {
      const keys = deriveVaultKeys("p", "vlt_n");
      const e1 = await encryptSnapshot(keys.encryptionKey, "vlt_n", "same");
      const e2 = await encryptSnapshot(keys.encryptionKey, "vlt_n", "same");
      expect(e1.nonce).not.toBe(e2.nonce);
      expect(e1.ct).not.toBe(e2.ct);
    },
    KDF_TIMEOUT,
  );
});

describe("mergeSnapshots", () => {
  const remote = (notes: RawNote[], deletedIds: string[] = [], syncedAt = 100): VaultSnapshot =>
    packSnapshot(notes, deletedIds, syncedAt);

  it("keeps the newer copy per id in both directions", () => {
    const result = mergeSnapshots(
      [note("a", "local-new", 200), note("b", "local-old", 50)],
      [],
      remote([note("a", "remote-old", 100), note("b", "remote-new", 150)]),
    );
    const a = result.merged.find((n) => n.id === "a");
    const b = result.merged.find((n) => n.id === "b");
    expect(a?.body).toBe("local-new");
    expect(b?.body).toBe("remote-new");
    expect(result.localChanged).toBe(true);
    expect(result.remoteChanged).toBe(true);
  });

  it("equal-timestamp ties converge on the remote copy", () => {
    const result = mergeSnapshots(
      [note("t", "local-variant", 100)],
      [],
      remote([note("t", "remote-variant", 100)]),
    );
    expect(result.merged.find((n) => n.id === "t")?.body).toBe("remote-variant");
    expect(result.localChanged).toBe(true); // local store must adopt the vault copy
    expect(result.remoteChanged).toBe(false);
  });

  it("remote tombstones win over stale local notes and propagate", () => {
    const result = mergeSnapshots([note("gone", "stale", 50)], [], remote([], ["gone"], 100));
    expect(result.merged.find((n) => n.id === "gone")).toBeUndefined();
    expect(result.deletedIds).toContain("gone");
    expect(result.localChanged).toBe(true);
  });

  it("an edit after a remote deletion resurrects the note and drops the tombstone", () => {
    const result = mergeSnapshots(
      [note("back", "edited later", 150)],
      [],
      remote([], ["back"], 100),
    );
    expect(result.merged.find((n) => n.id === "back")?.body).toBe("edited later");
    expect(result.deletedIds).not.toContain("back");
    expect(result.remoteChanged).toBe(true);
  });

  it("local tombstones delete the remote note and propagate", () => {
    const result = mergeSnapshots(
      [],
      [{ id: "x", deletedAt: 200 }],
      remote([note("x", "old", 100)]),
    );
    expect(result.merged.find((n) => n.id === "x")).toBeUndefined();
    expect(result.deletedIds).toContain("x");
    expect(result.remoteChanged).toBe(true);
  });

  it("a remote edit newer than the local deletion resurrects the note", () => {
    const result = mergeSnapshots(
      [],
      [{ id: "x", deletedAt: 100 }],
      remote([note("x", "edited elsewhere", 150)]),
    );
    expect(result.merged.find((n) => n.id === "x")?.body).toBe("edited elsewhere");
    expect(result.deletedIds).not.toContain("x");
    expect(result.localChanged).toBe(true);
  });

  it("no-ops cleanly when both sides are identical", () => {
    const same = [note("x", "same", 10)];
    const result = mergeSnapshots(same, [], remote(same, [], 10));
    expect(result.localChanged).toBe(false);
    expect(result.remoteChanged).toBe(false);
  });
});

describe("vault end-to-end (fakes)", () => {
  it(
    "createVault then syncVault on a second device transfers the library",
    async () => {
      const transport = fakeTransport();
      const deviceA = fakeLocal([note("n1", "# From A", 100)]);
      const { vaultId } = await createVault("shared-pass", deviceA, transport, 100);
      expect(vaultId.startsWith("vlt_")).toBe(true);
      expect(transport.vaults.get(vaultId)?.envelope).toBeTruthy();

      const deviceB = fakeLocal([]);
      const outcome = await syncVault("shared-pass", vaultId, deviceB, transport, 200);
      expect(deviceB.state.get("n1")?.body).toBe("# From A");
      expect(outcome.pulled).toBe(1);
      expect(outcome.mergedCount).toBe(1);
    },
    KDF_TIMEOUT,
  );

  it(
    "rejects a too-short passphrase at vault creation",
    async () => {
      const transport = fakeTransport();
      const local = fakeLocal([]);
      await expect(createVault("short", local, transport)).rejects.toThrow(
        new RegExp(String(MIN_PASSPHRASE_LENGTH)),
      );
      expect(transport.vaults.size).toBe(0);
    },
    KDF_TIMEOUT,
  );

  it(
    "second device edits flow back on next sync",
    async () => {
      const transport = fakeTransport();
      const deviceA = fakeLocal([note("n1", "v1", 100)]);
      const { vaultId } = await createVault("passphrase", deviceA, transport, 100);

      const deviceB = fakeLocal([note("n1", "v2-from-B", 300)]);
      await syncVault("passphrase", vaultId, deviceB, transport, 300);

      await syncVault("passphrase", vaultId, deviceA, transport, 400);
      expect(deviceA.state.get("n1")?.body).toBe("v2-from-B");
    },
    KDF_TIMEOUT,
  );

  it(
    "a local deletion propagates to other devices and stays deleted",
    async () => {
      const transport = fakeTransport();
      const deviceA = fakeLocal([note("n1", "keep", 100), note("n2", "delete me", 100)]);
      const { vaultId } = await createVault("passphrase", deviceA, transport, 100);

      const deviceB = fakeLocal([]);
      await syncVault("passphrase", vaultId, deviceB, transport, 200);
      expect(deviceB.state.has("n2")).toBe(true);

      // User deletes n2 on device B, then syncs.
      deviceB.userDelete("n2", 300);
      await syncVault("passphrase", vaultId, deviceB, transport, 300);
      expect(deviceB.state.has("n2")).toBe(false);
      expect(deviceB.tombstones.size).toBe(0); // folded into the vault

      // The deletion reaches device A…
      await syncVault("passphrase", vaultId, deviceA, transport, 400);
      expect(deviceA.state.has("n2")).toBe(false);
      expect(deviceA.state.has("n1")).toBe(true);

      // …and does NOT resurrect on device B's next sync.
      await syncVault("passphrase", vaultId, deviceB, transport, 500);
      expect(deviceB.state.has("n2")).toBe(false);
    },
    KDF_TIMEOUT,
  );

  it(
    "pulled notes keep their canonical updatedAt and a re-sync is a no-op",
    async () => {
      const transport = fakeTransport();
      const deviceA = fakeLocal([note("n1", "body", 12345)]);
      const { vaultId } = await createVault("passphrase", deviceA, transport, 12400);

      const deviceB = fakeLocal([]);
      await syncVault("passphrase", vaultId, deviceB, transport, 99999);
      expect(deviceB.state.get("n1")?.updatedAt).toBe(12345);

      const again = await syncVault("passphrase", vaultId, deviceB, transport, 100000);
      expect(again.pulled).toBe(0);
      expect(again.pushed).toBe(false);
    },
    KDF_TIMEOUT,
  );

  it(
    "three devices converge without clobbering the newest edit",
    async () => {
      const transport = fakeTransport();
      const deviceA = fakeLocal([note("n1", "v1", 100)]);
      const { vaultId } = await createVault("passphrase", deviceA, transport, 100);

      const deviceB = fakeLocal([]);
      await syncVault("passphrase", vaultId, deviceB, transport, 200);

      const deviceC = fakeLocal([]);
      await syncVault("passphrase", vaultId, deviceC, transport, 250);

      // B edits and syncs; C then syncs (pull), edits later, syncs again.
      deviceB.state.set("n1", note("n1", "v2-from-B", 300));
      await syncVault("passphrase", vaultId, deviceB, transport, 300);
      await syncVault("passphrase", vaultId, deviceC, transport, 350);
      expect(deviceC.state.get("n1")?.body).toBe("v2-from-B");
      expect(deviceC.state.get("n1")?.updatedAt).toBe(300);

      deviceC.state.set("n1", note("n1", "v3-from-C", 400));
      await syncVault("passphrase", vaultId, deviceC, transport, 400);

      // A and B both converge on C's newest edit.
      await syncVault("passphrase", vaultId, deviceA, transport, 500);
      await syncVault("passphrase", vaultId, deviceB, transport, 500);
      expect(deviceA.state.get("n1")?.body).toBe("v3-from-C");
      expect(deviceB.state.get("n1")?.body).toBe("v3-from-C");
      expect(deviceA.state.get("n1")?.updatedAt).toBe(400);
    },
    KDF_TIMEOUT,
  );

  it(
    "a concurrent push triggers a conflict retry that preserves both edits",
    async () => {
      const transport = fakeTransport();
      const deviceA = fakeLocal([note("a", "from-A-v1", 100)]);
      const { vaultId } = await createVault("passphrase", deviceA, transport, 100);

      // Device A edits its note; device B holds a brand-new note.
      deviceA.state.set("a", note("a", "from-A-v2", 300));
      const deviceB = fakeLocal([note("b", "from-B", 250)]);

      // While B is mid-sync (after its pull, before its push), A's push lands.
      let raced = false;
      const racingTransport: VaultTransport = {
        createVault: (p) => transport.createVault(p),
        getSnapshot: (id) => transport.getSnapshot(id),
        putSnapshot: async (id, token, envelope, opts) => {
          if (!raced) {
            raced = true;
            await syncVault("passphrase", vaultId, deviceA, transport, 310);
          }
          return transport.putSnapshot(id, token, envelope, opts);
        },
      };

      await syncVault("passphrase", vaultId, deviceB, racingTransport, 320);
      expect(raced).toBe(true);

      // B re-pulled and re-merged: it now has A's edit, and the vault has both.
      expect(deviceB.state.get("a")?.body).toBe("from-A-v2");
      await syncVault("passphrase", vaultId, deviceA, transport, 400);
      expect(deviceA.state.get("b")?.body).toBe("from-B");
      expect(deviceA.state.get("a")?.body).toBe("from-A-v2");
    },
    KDF_TIMEOUT,
  );

  it(
    "refuses to merge a snapshot from a newer schema version",
    async () => {
      const transport = fakeTransport();
      const deviceA = fakeLocal([]);
      const { vaultId } = await createVault("passphrase", deviceA, transport, 100);

      const keys = deriveVaultKeys("passphrase", vaultId);
      const v2Snapshot = JSON.stringify({ version: 2, notes: [], deletedIds: [], syncedAt: 200 });
      const envelope = await encryptSnapshot(keys.encryptionKey, vaultId, v2Snapshot);
      await transport.putSnapshot(vaultId, keys.writeToken, envelope);

      const deviceB = fakeLocal([note("x", "precious", 150)]);
      await expect(syncVault("passphrase", vaultId, deviceB, transport, 300)).rejects.toThrow(
        /newer version/,
      );
      expect(deviceB.state.get("x")?.body).toBe("precious"); // untouched
    },
    KDF_TIMEOUT,
  );

  it(
    "wrong passphrase cannot read the vault",
    async () => {
      const transport = fakeTransport();
      const deviceA = fakeLocal([note("n1", "secret", 100)]);
      const { vaultId } = await createVault("right-passphrase", deviceA, transport, 100);
      const deviceB = fakeLocal([]);
      // Surfaced as a friendly message, not a raw WebCrypto OperationError.
      await expect(
        syncVault("wrong-passphrase", vaultId, deviceB, transport, 200),
      ).rejects.toThrow(/passphrase doesn't match/);
      expect(deviceB.state.size).toBe(0);
    },
    KDF_TIMEOUT,
  );
});

describe("syncVaultWithKeys (resident keys, docs/ambient-vault-sync.md)", () => {
  const RAW = new Uint8Array(32).map((_, i) => 3 * i + 5);

  function local(seed: RawNote[]): { notes: RawNote[]; port: LocalNotesPort } {
    const notes: RawNote[] = [...seed];
    const port: LocalNotesPort = {
      listNotes: async (): Promise<RawNote[]> => [...notes],
      writeNote: async ({ id, body, updatedAt }): Promise<RawNote> => {
        const i = notes.findIndex((n) => n.id === id);
        const next: RawNote = { id, body, updatedAt };
        if (i >= 0) notes[i] = next;
        else notes.push(next);
        return next;
      },
      deleteNote: async ({ id }): Promise<void> => {
        const i = notes.findIndex((n) => n.id === id);
        if (i >= 0) notes.splice(i, 1);
      },
      listTombstones: async () => [],
      clearTombstones: async () => undefined,
    };
    return { notes, port };
  }

  it("syncs with a non-extractable CryptoKey handle exactly like raw bytes", async () => {
    const vaultId = "vlt_handle";
    const handle = await importEncryptionKey(RAW, false);
    expect(handle.extractable).toBe(false);
    let stored: { envelope: VaultEnvelope; etag: string } | null = null;
    let version = 0;
    const transport: VaultTransport = {
      createVault: async () => undefined,
      getSnapshot: async (
        _id,
        opts,
      ): Promise<RemoteSnapshot | RemoteNotModified | null> => {
        if (!stored) return null;
        if (opts?.ifNoneMatch && opts.ifNoneMatch === stored.etag) {
          return { notModified: true, etag: stored.etag };
        }
        return stored;
      },
      putSnapshot: async (_id, _t, envelope): Promise<{ etag: string }> => {
        const etag = `"v${++version}"`;
        stored = { envelope, etag };
        return { etag };
      },
    };

    // Device A pushes with raw bytes.
    const a = local([{ id: "n1", body: "from A", updatedAt: 10 }]);
    const first = await syncVaultWithKeys({ encryptionKey: RAW, writeToken: "t" }, vaultId, a.port, transport);
    expect(first).toMatchObject({ pushed: true, etag: '"v1"', notModified: false });

    // Device B pulls with the handle.
    const b = local([]);
    const pulled = await syncVaultWithKeys({ encryptionKey: handle, writeToken: "t" }, vaultId, b.port, transport);
    expect(pulled.pulled).toBe(1);
    expect(b.notes[0]?.body).toBe("from A");

    // A conditional poll from B is a 304 and touches nothing.
    const poll = await syncVaultWithKeys({ encryptionKey: handle, writeToken: "t" }, vaultId, b.port, transport, {
      ifNoneMatch: pulled.etag,
    });
    expect(poll).toMatchObject({ notModified: true, pulled: 0, pushed: false, etag: '"v1"' });
  });
});
