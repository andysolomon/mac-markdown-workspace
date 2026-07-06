import type { RawNote } from "./notesModel";
import {
  deriveVaultKeys,
  encryptSnapshot,
  decryptSnapshot,
  generateVaultId,
  type VaultEnvelope,
} from "./vaultCrypto";

/**
 * Vault sync service (issue #19 / W-000019, docs/passwordless-vault-sync.md).
 *
 * Sits ABOVE the platform shims: local notes IO and the HTTP transport are
 * injected ports, so the whole pull/merge/push cycle is unit-testable and the
 * AppApi surface stays untouched (the doc's preferred shape). v1 semantics:
 * one encrypted snapshot per vault, last-write-wins per note id, deletions
 * as tombstones on both sides.
 *
 * Known limitation (v1): LWW compares wall-clock updatedAt across devices,
 * so clock skew between devices can pick the "wrong" winner near-simultaneous
 * edits. Acceptable for a manual-sync notes app; a logical version counter is
 * the v2 fix if it ever bites.
 */

export interface VaultSnapshot {
  version: 1;
  notes: RawNote[];
  deletedIds: string[];
  syncedAt: number;
}

/** A locally recorded deletion awaiting sync. The app's delete path must
    record one of these (id + when) — without it a local delete cannot
    propagate and the note would resurrect from the vault on next sync. */
export interface VaultTombstone {
  id: string;
  deletedAt: number;
}

/** Local notes port — platform adapter in production, in-memory fakes in
    tests. writeNote MUST persist the given updatedAt verbatim (never re-stamp
    with "now"): pulled notes keep their canonical timestamp or LWW corrupts
    across 3+ devices. */
export interface LocalNotesPort {
  listNotes(): Promise<RawNote[]>;
  writeNote(payload: { id: string; body: string; updatedAt: number }): Promise<RawNote>;
  deleteNote(payload: { id: string }): Promise<void>;
  /** Pending local deletions (recorded by the app's delete flow). */
  listTombstones(): Promise<VaultTombstone[]>;
  /** Drop tombstones that have been folded into the vault (or resolved). */
  clearTombstones(ids: string[]): Promise<void>;
}

export interface VaultMeta {
  updatedAt: number;
  size: number;
  schemaVersion: number;
}

/** putSnapshot must throw this when the ifMatch precondition fails (HTTP 412)
    so syncVault can re-pull, re-merge, and retry instead of clobbering a
    concurrent device's push. */
export class VaultConflictError extends Error {
  constructor(message = "Vault snapshot changed since last pull") {
    super(message);
    this.name = "VaultConflictError";
  }
}

export interface RemoteSnapshot {
  envelope: VaultEnvelope;
  /** Opaque version tag (S3 ETag in Phase B); null if the store has none. */
  etag: string | null;
}

/** Remote transport port — HTTP client for the Phase B API (issue #20). */
export interface VaultTransport {
  createVault(payload: { vaultId: string; writeTokenHash: string }): Promise<void>;
  /** Cheap freshness probe (meta.json) so a "Sync now" can skip the full
      download when nothing changed. Optional; unused until Phase C tracks
      lastSyncedAt + local dirtiness. */
  getMeta?(vaultId: string): Promise<VaultMeta | null>;
  getSnapshot(vaultId: string): Promise<RemoteSnapshot | null>;
  putSnapshot(
    vaultId: string,
    writeToken: string,
    envelope: VaultEnvelope,
    opts?: { ifMatch?: string | null },
  ): Promise<void>;
}

export interface MergeResult {
  merged: RawNote[];
  deletedIds: string[];
  /** Local store must change (remote had newer/new/deleted content). */
  localChanged: boolean;
  /** Remote must be re-uploaded (local had newer content or new deletions). */
  remoteChanged: boolean;
}

/**
 * Merge local state (notes + pending delete tombstones) with a remote
 * snapshot.
 *
 * Rules (v1, doc "Merge strategy"):
 * - Per id: keep the copy with the higher updatedAt. Exact ties keep the
 *   REMOTE copy — deterministic, so every device converges on the vault's
 *   version instead of ping-ponging its own.
 * - Deletions are tombstones on both sides; a tombstone wins over a note
 *   UNLESS the note was edited after the deletion (local note vs remote
 *   tombstone: updatedAt > remote syncedAt; remote note vs local tombstone:
 *   updatedAt > tombstone deletedAt) — the edit resurrects the note.
 */
export function mergeSnapshots(
  localNotes: RawNote[],
  localTombstones: VaultTombstone[],
  remote: VaultSnapshot,
): MergeResult {
  const byId = new Map<string, RawNote>();
  for (const note of remote.notes) byId.set(note.id, note);
  const remoteDeleted = new Set(remote.deletedIds);
  const localIds = new Set(localNotes.map((n) => n.id));

  let localChanged = false;
  let remoteChanged = false;

  // Pass 1: per-id LWW union of live notes.
  for (const local of localNotes) {
    const existing = byId.get(local.id);
    if (!existing) {
      byId.set(local.id, local);
      // If remote tombstoned it, pass 2 decides (resurrect vs delete) and
      // sets the right flag; only a genuinely new note dirties the remote.
      if (!remoteDeleted.has(local.id)) remoteChanged = true;
    } else if (local.updatedAt > existing.updatedAt) {
      byId.set(local.id, local);
      remoteChanged = true;
    } else if (existing.updatedAt > local.updatedAt) {
      localChanged = true;
    } else if (existing.body !== local.body) {
      localChanged = true; // equal-timestamp tie: converge on the remote copy
    }
  }

  const deleted = new Set<string>();

  // Pass 2: remote tombstones vs (possibly local) notes.
  for (const id of remoteDeleted) {
    const note = byId.get(id);
    if (!note) {
      deleted.add(id); // nothing to delete here; keep propagating
      continue;
    }
    if (note.updatedAt > remote.syncedAt) {
      remoteChanged = true; // edited after the deletion — resurrect
    } else {
      byId.delete(id);
      deleted.add(id);
      if (localIds.has(id)) localChanged = true;
    }
  }

  // Pass 3: local tombstones vs remote notes.
  for (const t of localTombstones) {
    if (localIds.has(t.id)) continue; // stale — the note exists locally again
    if (deleted.has(t.id)) continue; // remote already deleted it too
    const note = byId.get(t.id);
    if (!note) {
      deleted.add(t.id); // remote never had it / already gone; record anyway
      remoteChanged = true;
      continue;
    }
    if (note.updatedAt > t.deletedAt) {
      localChanged = true; // remote edit is newer than our delete — resurrect
    } else {
      byId.delete(t.id);
      deleted.add(t.id);
      remoteChanged = true;
    }
  }

  // Remote-only notes that survived deletion are new locally.
  for (const note of remote.notes) {
    if (!localIds.has(note.id) && byId.has(note.id)) localChanged = true;
  }

  return {
    merged: [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    deletedIds: [...deleted],
    localChanged,
    remoteChanged,
  };
}

export function packSnapshot(notes: RawNote[], deletedIds: string[], now: number): VaultSnapshot {
  return { version: 1, notes, deletedIds, syncedAt: now };
}

function parseSnapshot(plaintext: string): VaultSnapshot {
  const parsed = JSON.parse(plaintext) as { version?: number };
  if (parsed.version !== 1) {
    throw new Error(
      `This vault was written by a newer version of the app (snapshot v${String(parsed.version)}); update this device before syncing.`,
    );
  }
  return parsed as VaultSnapshot;
}

export interface SyncOutcome {
  /** Notes actually written into the local store this sync. */
  pulled: number;
  pushed: boolean;
  mergedCount: number;
}

/** Minimum passphrase length (after normalization) accepted at vault
    creation. The UI should push users well past this; the KDF cannot save a
    trivial passphrase from offline brute force. */
export const MIN_PASSPHRASE_LENGTH = 8;

const MAX_SYNC_ATTEMPTS = 3;

/** Create a fresh vault from the current local library. Returns the vault id
    (the user's "Sync code"). The passphrase is used transiently and never
    stored. */
export async function createVault(
  passphrase: string,
  local: LocalNotesPort,
  transport: VaultTransport,
  now: number = Date.now(),
): Promise<{ vaultId: string }> {
  if (passphrase.normalize("NFKC").length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  const vaultId = generateVaultId();
  const keys = deriveVaultKeys(passphrase, vaultId);
  try {
    await transport.createVault({ vaultId, writeTokenHash: keys.writeTokenHash });
    const notes = await local.listNotes();
    const tombstones = await local.listTombstones();
    const snapshot = packSnapshot(
      notes,
      tombstones.map((t) => t.id),
      now,
    );
    const envelope = await encryptSnapshot(keys.encryptionKey, vaultId, JSON.stringify(snapshot));
    await transport.putSnapshot(vaultId, keys.writeToken, envelope, { ifMatch: null });
    if (tombstones.length) await local.clearTombstones(tombstones.map((t) => t.id));
    return { vaultId };
  } finally {
    keys.encryptionKey.fill(0);
  }
}

/** Full sync cycle: pull remote, merge, apply locally, push when needed.
    Retries the cycle on a concurrent-push conflict (VaultConflictError). */
export async function syncVault(
  passphrase: string,
  vaultId: string,
  local: LocalNotesPort,
  transport: VaultTransport,
  now: number = Date.now(),
): Promise<SyncOutcome> {
  const keys = deriveVaultKeys(passphrase, vaultId);
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        return await syncOnce(keys.encryptionKey, keys.writeToken, vaultId, local, transport, now);
      } catch (error) {
        if (error instanceof VaultConflictError && attempt < MAX_SYNC_ATTEMPTS) continue;
        throw error;
      }
    }
  } finally {
    keys.encryptionKey.fill(0);
  }
}

async function syncOnce(
  encryptionKey: Uint8Array,
  writeToken: string,
  vaultId: string,
  local: LocalNotesPort,
  transport: VaultTransport,
  now: number,
): Promise<SyncOutcome> {
  const snapshot = await transport.getSnapshot(vaultId);
  const localNotes = await local.listNotes();
  const tombstones = await local.listTombstones();
  const tombstoneIds = tombstones.map((t) => t.id);

  if (!snapshot) {
    // Empty vault: first push.
    const initial = packSnapshot(localNotes, tombstoneIds, now);
    await transport.putSnapshot(
      vaultId,
      writeToken,
      await encryptSnapshot(encryptionKey, vaultId, JSON.stringify(initial)),
      { ifMatch: null },
    );
    if (tombstoneIds.length) await local.clearTombstones(tombstoneIds);
    return { pulled: 0, pushed: true, mergedCount: localNotes.length };
  }

  const remote = parseSnapshot(await decryptSnapshot(encryptionKey, vaultId, snapshot.envelope));
  const result = mergeSnapshots(localNotes, tombstones, remote);

  let pulled = 0;
  if (result.localChanged) {
    const localById = new Map(localNotes.map((n) => [n.id, n]));
    const mergedIds = new Set(result.merged.map((n) => n.id));
    for (const note of result.merged) {
      const existing = localById.get(note.id);
      if (!existing || existing.updatedAt !== note.updatedAt || existing.body !== note.body) {
        await local.writeNote({ id: note.id, body: note.body, updatedAt: note.updatedAt });
        pulled++;
      }
    }
    for (const note of localNotes) {
      if (!mergedIds.has(note.id)) await local.deleteNote({ id: note.id });
    }
  }

  if (result.remoteChanged) {
    const next = packSnapshot(result.merged, result.deletedIds, now);
    await transport.putSnapshot(
      vaultId,
      writeToken,
      await encryptSnapshot(encryptionKey, vaultId, JSON.stringify(next)),
      { ifMatch: snapshot.etag },
    );
  }

  // Every listed tombstone is now folded into the vault (or resolved by a
  // newer remote edit) — safe to drop. Skipped on conflict via the throw.
  if (tombstoneIds.length) await local.clearTombstones(tombstoneIds);

  return { pulled, pushed: result.remoteChanged, mergedCount: result.merged.length };
}
