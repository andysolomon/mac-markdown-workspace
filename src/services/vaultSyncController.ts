import { normalizePairingCode } from "../../shared/pairingCode";
import { getAmbientScheduler, rebindAmbientSync } from "./ambientSync";
import { createLocalNotesPort } from "./localNotesPort";
import { flushNoteSaves, reconcileActiveNoteBuffer } from "./noteAutosave";
import { useNotesStore } from "./notesStore";
import { useSettingsStore } from "./settingsStore";
import { showToast } from "./toast";
import { deriveVaultKeys, importEncryptionKey, type VaultKeys } from "./vaultCrypto";
import { PROD_ORIGIN } from "./vaultHttpTransport";
import {
  adoptSession,
  clearSession,
  createTransport,
  getKeyStore,
  getSessionBackend,
  restoreSession,
} from "./vaultSession";
import { createVault, syncVaultWithKeys, type SyncOutcome } from "./vaultSync";

/**
 * Vault sync controller (issue #21, reshaped by docs/ambient-vault-sync.md)
 * — the seam between the UI and the sync engine for USER actions: enable,
 * link (by pairing code or legacy vault id), unlock / sync now, mint a
 * pairing code, turn off. Background cycles live in ambientSync.
 *
 * The passphrase is passed in per call and never retained. What may be
 * retained — only when the user opts in — is the DERIVED material, through
 * the VaultKeyStore; from then on this device syncs without a prompt.
 */

async function persist(patch: {
  syncEnabled?: boolean;
  syncVaultId?: string | null;
  lastSyncedAt?: number | null;
}): Promise<void> {
  const store = useSettingsStore.getState();
  if (patch.syncEnabled !== undefined) {
    store.setSyncEnabled(patch.syncEnabled);
    await window.appApi?.setSetting?.("syncEnabled", patch.syncEnabled);
  }
  if (patch.syncVaultId !== undefined) {
    store.setSyncVaultId(patch.syncVaultId);
    await window.appApi?.setSetting?.("syncVaultId", patch.syncVaultId);
  }
  if (patch.lastSyncedAt !== undefined) {
    store.setLastSyncedAt(patch.lastSyncedAt);
    await window.appApi?.setSetting?.("lastSyncedAt", patch.lastSyncedAt);
  }
}

/** Sync must start from the latest local buffer, not from a pre-debounce
    snapshot of the notes adapter. */
async function flushBeforeSync(): Promise<void> {
  const result = await flushNoteSaves();
  if ("error" in result) throw new Error(`Save your changes before syncing: ${result.error}`);
}

async function refreshLibrary(): Promise<void> {
  await useNotesStore.getState().reloadLibrary();
  reconcileActiveNoteBuffer();
}

/** Turn freshly derived keys into the session's backend: import the AES key
    as a non-extractable handle, zero the raw bytes, optionally remember the
    material for next launch. A failed remember is a toast, never a failed
    sync — the device just keeps asking for the passphrase. */
async function adoptKeys(
  vaultId: string,
  keys: VaultKeys,
  remember: boolean,
  initialEtag: string | null = null,
): Promise<void> {
  if (remember) {
    try {
      await getKeyStore().remember(vaultId, keys);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't remember this device.");
    }
  }
  const handle = await importEncryptionKey(keys.encryptionKey, false);
  keys.encryptionKey.fill(0);
  adoptSession(vaultId, { encryptionKey: handle, writeToken: keys.writeToken }, initialEtag);
  rebindAmbientSync();
}

/** Create a brand-new vault from this device's current library. Returns the
    vault id. */
export async function enableSync(passphrase: string, remember = true): Promise<string> {
  await flushBeforeSync();
  const { vaultId, keys, etag } = await createVault(passphrase, createLocalNotesPort(), createTransport());
  await adoptKeys(vaultId, keys, remember, etag);
  await persist({ syncEnabled: true, syncVaultId: vaultId, lastSyncedAt: Date.now() });
  showToast("Cloud sync enabled");
  return vaultId;
}

const LEGACY_VAULT_ID = /^vlt_[0-9a-f-]{36}$/;

/** A pairing code (`K7F2-M9QX`) is redeemed for the vault id it names; a
    full vault id pasted from an older build is accepted as-is. */
export async function resolveVaultId(input: string): Promise<string> {
  const trimmed = input.trim();
  if (LEGACY_VAULT_ID.test(trimmed)) return trimmed;
  const code = normalizePairingCode(trimmed);
  if (!code) throw new Error("That doesn't look like a pairing code.");
  const transport = createTransport();
  if (!transport.redeemPairing) throw new Error("Pairing codes aren't supported here.");
  const { vaultId } = await transport.redeemPairing(code);
  return vaultId;
}

/** Join an existing vault: pull + merge into this device. */
export async function linkDevice(
  codeOrVaultId: string,
  passphrase: string,
  remember = true,
): Promise<SyncOutcome> {
  await flushBeforeSync();
  const vaultId = await resolveVaultId(codeOrVaultId);
  const keys = deriveVaultKeys(passphrase, vaultId);
  let outcome: SyncOutcome;
  try {
    outcome = await syncVaultWithKeys(keys, vaultId, createLocalNotesPort(), createTransport());
  } catch (error) {
    keys.encryptionKey.fill(0);
    throw error;
  }
  await adoptKeys(vaultId, keys, remember, outcome.etag);
  await refreshLibrary();
  await persist({ syncEnabled: true, syncVaultId: vaultId, lastSyncedAt: Date.now() });
  showToast(outcome.pulled ? `Linked — ${outcome.pulled} notes pulled` : "Device linked");
  return outcome;
}

function requireVaultId(): string {
  const vaultId = useSettingsStore.getState().syncVaultId;
  if (!vaultId) throw new Error("Cloud sync isn't set up on this device yet.");
  return vaultId;
}

/** Run a full cycle now. With a passphrase this also unlocks the device
    (and remembers it when asked); without one it needs resident keys. */
export async function syncNow(
  passphrase?: string,
  remember = false,
): Promise<{ pulled: number; pushed: boolean }> {
  const vaultId = requireVaultId();

  if (passphrase) {
    await flushBeforeSync();
    const keys = deriveVaultKeys(passphrase, vaultId);
    let outcome: SyncOutcome;
    try {
      outcome = await syncVaultWithKeys(keys, vaultId, createLocalNotesPort(), createTransport());
    } catch (error) {
      keys.encryptionKey.fill(0);
      throw error;
    }
    await adoptKeys(vaultId, keys, remember, outcome.etag);
    await refreshLibrary();
    await persist({ lastSyncedAt: Date.now() });
    showToast(outcome.pulled ? `Synced — ${outcome.pulled} updated` : "Up to date");
    return outcome;
  }

  // Resident keys: share single-flight with the ambient loop when it's bound.
  const scheduler = getAmbientScheduler();
  if (scheduler) {
    const result = await scheduler.syncNow();
    showToast(result.pulled ? `Synced — ${result.pulled} updated` : "Up to date");
    return result;
  }
  const backend = getSessionBackend(vaultId) ?? (await restoreSession(vaultId));
  if (!backend) throw new Error("Enter your passphrase to sync this device.");
  await flushBeforeSync();
  const result = await backend.converge("full");
  if (result.pulled) await refreshLibrary();
  await persist({ lastSyncedAt: Date.now() });
  showToast(result.pulled ? `Synced — ${result.pulled} updated` : "Up to date");
  return result;
}

/** Mint a ten-minute pairing code for the bound vault. Uses resident keys;
    with none, the passphrase proves write access for this one call and is
    then discarded (nothing is remembered). */
export async function mintPairingCode(passphrase?: string): Promise<{ code: string; expiresAt: number }> {
  const vaultId = requireVaultId();
  const backend = getSessionBackend(vaultId) ?? (await restoreSession(vaultId));
  if (backend?.createPairing) return backend.createPairing();
  if (!passphrase) throw new Error("Enter your passphrase to pair a device.");
  const transport = createTransport();
  if (!transport.createPairing) throw new Error("Pairing codes aren't supported here.");
  const keys = deriveVaultKeys(passphrase, vaultId);
  try {
    return await transport.createPairing(vaultId, keys.writeToken);
  } finally {
    keys.encryptionKey.fill(0);
  }
}

/** Stop syncing on THIS device: forget its resident keys and its binding.
    The vault and its data remain in the cloud; other devices are
    unaffected; local notes stay on disk (local-first — "turn off" is not a
    wipe). */
export async function disableSync(): Promise<void> {
  const vaultId = useSettingsStore.getState().syncVaultId;
  if (vaultId) {
    try {
      await getKeyStore().forget(vaultId);
    } catch {
      /* nothing remembered, or storage already gone */
    }
  }
  clearSession();
  await persist({ syncEnabled: false, syncVaultId: null, lastSyncedAt: null });
  showToast("Cloud sync turned off on this device");
}

/** Whether this device can sync without a passphrase right now. */
export async function hasResidentKeys(): Promise<boolean> {
  const vaultId = useSettingsStore.getState().syncVaultId;
  if (!vaultId) return false;
  return getSessionBackend(vaultId) !== null || (await restoreSession(vaultId)) !== null;
}

export type RememberStrategy = "host" | "browser" | "none";

/** How "Remember this device" would be honoured here, for the UI copy. */
export async function rememberStrategy(): Promise<RememberStrategy> {
  return getKeyStore().strategy();
}

export { PROD_ORIGIN };
