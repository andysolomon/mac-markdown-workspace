import {
  syncVaultWithKeys,
  type LocalNotesPort,
  type VaultKeyMaterial,
  type VaultTransport,
} from "./vaultSync";

/**
 * SyncBackend (docs/ambient-vault-sync.md, Part 4) — the seam the app talks
 * to, one level above VaultTransport.
 *
 * The app needs exactly one operation: "converge this library with the
 * remote". How that happens is the backend's business. Today there is one
 * implementation, the encrypted-snapshot vault on our S3; the eventual
 * user-owned backend (plaintext .md files in an iCloud Drive / folder /
 * WebDAV location — readable in Finder, unencrypted because the trust
 * boundary is the user's own storage) is a different shape underneath and
 * the same shape here. vaultSyncController and the ambient loop never reach
 * below this interface.
 */

export type ConvergeMode =
  /** Pull, merge, and push whatever changed on either side. */
  | "full"
  /** Pull-only poll: skip everything when the remote hasn't changed since
      the last cycle. Callers with local edits must use "full". */
  | "pull-if-changed";

export interface ConvergeResult {
  /** Notes written into local storage by this cycle. */
  pulled: number;
  pushed: boolean;
  /** The remote hadn't changed; nothing moved in either direction. */
  notModified: boolean;
}

export interface SyncBackend {
  readonly vaultId: string;
  converge(mode: ConvergeMode): Promise<ConvergeResult>;
  /** Hand this library's address to another device. Optional: a backend
      addressed by a folder path has nothing to mint. */
  createPairing?(): Promise<{ code: string; expiresAt: number }>;
}

export interface VaultSyncBackendOptions {
  vaultId: string;
  keys: VaultKeyMaterial;
  local: LocalNotesPort;
  transport: VaultTransport;
  /** Remote version tag already known (e.g. from the cycle that created the
      session) so the first poll can be conditional. */
  initialEtag?: string | null;
  now?: () => number;
}

/** The encrypted-snapshot vault (our S3) as a SyncBackend. Tracks the remote
    ETag across cycles so "pull-if-changed" is a 304 when nothing moved. */
export function createVaultSyncBackend(opts: VaultSyncBackendOptions): SyncBackend {
  let etag: string | null = opts.initialEtag ?? null;
  const now = opts.now ?? Date.now;

  return {
    vaultId: opts.vaultId,

    async converge(mode) {
      const outcome = await syncVaultWithKeys(opts.keys, opts.vaultId, opts.local, opts.transport, {
        ifNoneMatch: mode === "pull-if-changed" ? etag : null,
        now: now(),
      });
      etag = outcome.etag;
      return { pulled: outcome.pulled, pushed: outcome.pushed, notModified: outcome.notModified };
    },

    async createPairing() {
      if (!opts.transport.createPairing) {
        throw new Error("Pairing codes aren't supported by this sync transport.");
      }
      return opts.transport.createPairing(opts.vaultId, opts.keys.writeToken);
    },
  };
}
