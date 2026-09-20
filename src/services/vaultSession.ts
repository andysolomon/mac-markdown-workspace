import { createLocalNotesPort } from "./localNotesPort";
import { createVaultSyncBackend, type SyncBackend } from "./syncBackend";
import { createHttpVaultTransport, resolveVaultBaseUrl } from "./vaultHttpTransport";
import { createVaultKeyStore, type VaultKeyStore } from "./vaultKeyStore";
import type { VaultKeyMaterial, VaultTransport } from "./vaultSync";

/**
 * The in-memory sync session: which vault this device is bound to and a
 * SyncBackend holding its resident keys for the life of the page. Both the
 * controller (user actions) and the ambient loop (background cycles) go
 * through here, so neither imports the other.
 *
 * Keys arrive either fresh from a passphrase (adoptSession, after enable /
 * link / a remembered "Sync now") or from the VaultKeyStore on startup
 * (restoreSession). Nothing here ever sees the passphrase.
 */

let keyStore: VaultKeyStore | null = null;
let session: { vaultId: string; backend: SyncBackend } | null = null;
let restoring: { vaultId: string; promise: Promise<SyncBackend | null> } | null = null;

export function getKeyStore(): VaultKeyStore {
  keyStore ??= createVaultKeyStore();
  return keyStore;
}

/** The transport chooses a fixed origin for native shells and same-origin
    requests for deployed web. */
export function createTransport(): VaultTransport {
  return createHttpVaultTransport(resolveVaultBaseUrl());
}

/** The bound backend for `vaultId` (or for whatever vault is bound, when
    omitted) if its keys are already in memory; null otherwise. */
export function getSessionBackend(vaultId?: string): SyncBackend | null {
  if (!session) return null;
  if (vaultId && session.vaultId !== vaultId) return null;
  return session.backend;
}

/** Bind this device to `vaultId` with material derived just now. */
export function adoptSession(
  vaultId: string,
  keys: VaultKeyMaterial,
  initialEtag: string | null = null,
): SyncBackend {
  const backend = createVaultSyncBackend({
    vaultId,
    keys,
    local: createLocalNotesPort(),
    transport: createTransport(),
    initialEtag,
  });
  session = { vaultId, backend };
  return backend;
}

/** Rebuild the session from remembered keys. Memoized per vault id so a
    startup race (settings hydrate + first visibility tick) recalls once. */
export function restoreSession(vaultId: string): Promise<SyncBackend | null> {
  const existing = getSessionBackend(vaultId);
  if (existing) return Promise.resolve(existing);
  if (restoring && restoring.vaultId === vaultId) return restoring.promise;
  const promise = (async () => {
    const keys = await getKeyStore().recall(vaultId);
    if (!keys) return null;
    // Another caller may have adopted a fresh session while we were reading.
    return getSessionBackend(vaultId) ?? adoptSession(vaultId, keys);
  })().finally(() => {
    if (restoring && restoring.promise === promise) restoring = null;
  });
  restoring = { vaultId, promise };
  return promise;
}

export function clearSession(): void {
  session = null;
  restoring = null;
}

/** Test seam: swap the key store and drop any bound session. */
export function resetVaultSessionForTests(store: VaultKeyStore | null = null): void {
  keyStore = store;
  clearSession();
}
