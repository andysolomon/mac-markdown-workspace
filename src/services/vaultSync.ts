import type { RawNote } from "./notesModel";
import {
  deriveVaultKeys,
  encryptSnapshot,
  decryptSnapshot,
  generateVaultId,
  type AesKeyInput,
  type VaultEnvelope,
  type VaultKeys,
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

/** A conditional pull found the remote unchanged since `etag` (HTTP 304):
    nothing was downloaded. */
export interface RemoteNotModified {
  notModified: true;
  etag: string;
}

export function isNotModified(
  result: RemoteSnapshot | RemoteNotModified | null,
): result is RemoteNotModified {
  return result !== null && "notModified" in result && result.notModified === true;
}

/** Remote transport port — HTTP client for the Phase B API (issue #20). */
export interface VaultTransport {
  createVault(payload: { vaultId: string; writeTokenHash: string }): Promise<void>;
  /** Cheap freshness probe (meta.json). Optional and advisory only — the
      ambient loop decides freshness from the snapshot ETag via a conditional
      getSnapshot, never from meta.updatedAt. */
  getMeta?(vaultId: string): Promise<VaultMeta | null>;
  /** `ifNoneMatch` makes the pull conditional: a transport that supports it
      answers RemoteNotModified when the remote still carries that etag. A
      transport that ignores the option simply returns the snapshot. */
  getSnapshot(
    vaultId: string,
    opts?: { ifNoneMatch?: string },
  ): Promise<RemoteSnapshot | RemoteNotModified | null>;
  /** May resolve with the remote's new version tag so a later conditional
      pull can skip the download; a transport without one resolves void. */
  putSnapshot(
    vaultId: string,
    writeToken: string,
    envelope: VaultEnvelope,
    opts?: { ifMatch?: string | null },
  ): Promise<void | { etag: string | null }>;
  /** Pairing (docs/ambient-vault-sync.md, Part 2). Minting requires the write
      token; redeeming yields only the vault id. Optional so in-memory fakes
      that never pair stay small. */
  createPairing?(vaultId: string, writeToken: string): Promise<{ code: string; expiresAt: number }>;
  redeemPairing?(code: string): Promise<{ vaultId: string }>;
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
  /** Remote version tag after this cycle (what a later conditional pull
      should send as ifNoneMatch); null when the remote reports none. */
  etag: string | null;
  /** True when a conditional pull short-circuited on 304: nothing moved. */
  notModified: boolean;
}

/** What a device needs to sync without the passphrase: the derived
    encryption key (raw or an imported handle) and the write token. This is
    exactly the material a VaultKeyStore remembers. */
export interface VaultKeyMaterial {
  encryptionKey: AesKeyInput;
  writeToken: string;
}

/** Minimum passphrase length (after normalization) accepted at vault
    creation. The UI should push users well past this; the KDF cannot save a
    trivial passphrase from offline brute force. */
export const MIN_PASSPHRASE_LENGTH = 8;

const MAX_SYNC_ATTEMPTS = 3;

/** Create a fresh vault from the current local library. Returns the vault id
    (the user's "Sync code") and the derived keys, which the CALLER owns: hand
    them to a VaultKeyStore to remember the device, or `.fill(0)` the raw
    encryption key when done. The passphrase itself is used transiently and
    never stored. */
export async function createVault(
  passphrase: string,
  local: LocalNotesPort,
  transport: VaultTransport,
  now: number = Date.now(),
): Promise<{ vaultId: string; keys: VaultKeys; etag: string | null }> {
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
    const put = await transport.putSnapshot(vaultId, keys.writeToken, envelope, { ifMatch: null });
    if (tombstones.length) await local.clearTombstones(tombstones.map((t) => t.id));
    return { vaultId, keys, etag: etagOf(put) };
  } catch (error) {
    keys.encryptionKey.fill(0);
    throw error;
  }
}

/** Full sync cycle from the passphrase: derive, sync, zero. Retries the
    cycle on a concurrent-push conflict (VaultConflictError). */
export async function syncVault(
  passphrase: string,
  vaultId: string,
  local: LocalNotesPort,
  transport: VaultTransport,
  now: number = Date.now(),
): Promise<SyncOutcome> {
  const keys = deriveVaultKeys(passphrase, vaultId);
  try {
    return await syncVaultWithKeys(keys, vaultId, local, transport, { now });
  } finally {
    keys.encryptionKey.fill(0);
  }
}

/** putSnapshot may resolve void (fakes, transports without version tags). */
function etagOf(result: void | { etag: string | null }): string | null {
  return result && typeof result === "object" ? result.etag : null;
}

export interface SyncOptions {
  /** Make the pull conditional on this remote etag. Use ONLY for a pull-only
      poll: on 304 the cycle ends without looking at local state, so a device
      with unsynced local edits must run an unconditional cycle instead. */
  ifNoneMatch?: string | null;
  now?: number;
}

/** Full sync cycle from already-derived material (resident keys, or keys
    the caller is holding for the session). No scrypt, no passphrase. */
export async function syncVaultWithKeys(
  keys: VaultKeyMaterial,
  vaultId: string,
  local: LocalNotesPort,
  transport: VaultTransport,
  opts: SyncOptions = {},
): Promise<SyncOutcome> {
  const now = opts.now ?? Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await syncOnce(
        keys.encryptionKey,
        keys.writeToken,
        vaultId,
        local,
        transport,
        now,
        opts.ifNoneMatch ?? undefined,
      );
    } catch (error) {
      if (error instanceof VaultConflictError && attempt < MAX_SYNC_ATTEMPTS) continue;
      throw error;
    }
  }
}

async function syncOnce(
  encryptionKey: AesKeyInput,
  writeToken: string,
  vaultId: string,
  local: LocalNotesPort,
  transport: VaultTransport,
  now: number,
  ifNoneMatch?: string,
): Promise<SyncOutcome> {
  const snapshot = await transport.getSnapshot(
    vaultId,
    ifNoneMatch ? { ifNoneMatch } : undefined,
  );
  if (isNotModified(snapshot)) {
    return { pulled: 0, pushed: false, mergedCount: 0, etag: snapshot.etag, notModified: true };
  }
  const localNotes = await local.listNotes();
  const tombstones = await local.listTombstones();
  const tombstoneIds = tombstones.map((t) => t.id);

  if (!snapshot) {
    // Empty vault: first push.
    const initial = packSnapshot(localNotes, tombstoneIds, now);
    const put = await transport.putSnapshot(
      vaultId,
      writeToken,
      await encryptSnapshot(encryptionKey, vaultId, JSON.stringify(initial)),
      { ifMatch: null },
    );
    if (tombstoneIds.length) await local.clearTombstones(tombstoneIds);
    return {
      pulled: 0,
      pushed: true,
      mergedCount: localNotes.length,
      etag: etagOf(put),
      notModified: false,
    };
  }

  let plaintext: string;
  try {
    plaintext = await decryptSnapshot(encryptionKey, vaultId, snapshot.envelope);
  } catch {
    // AES-GCM can't distinguish a wrong key from tampering; on a sync the
    // overwhelmingly common cause is a mistyped passphrase, so say so plainly
    // instead of surfacing a raw WebCrypto OperationError.
    throw new Error("That passphrase doesn't match this vault.");
  }
  const remote = parseSnapshot(plaintext); // throws its own clear version error
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

  let etag: string | null = snapshot.etag;
  if (result.remoteChanged) {
    const next = packSnapshot(result.merged, result.deletedIds, now);
    const put = await transport.putSnapshot(
      vaultId,
      writeToken,
      await encryptSnapshot(encryptionKey, vaultId, JSON.stringify(next)),
      { ifMatch: snapshot.etag },
    );
    // The PUT response carries the remote's NEW tag. Without one, report null
    // so the next conditional pull runs unconditionally once and re-learns it.
    etag = etagOf(put);
  }

  // Every listed tombstone is now folded into the vault (or resolved by a
  // newer remote edit) — safe to drop. Skipped on conflict via the throw.
  if (tombstoneIds.length) await local.clearTombstones(tombstoneIds);

  return {
    pulled,
    pushed: result.remoteChanged,
    mergedCount: result.merged.length,
    etag,
    notModified: false,
  };
}
