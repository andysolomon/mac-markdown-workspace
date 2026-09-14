import {
  createHttpVaultTransport,
  PROD_ORIGIN,
  resolveVaultBaseUrl,
} from "./vaultHttpTransport";
import { createLocalNotesPort } from "./localNotesPort";
import { createVault, syncVault, type SyncOutcome, type VaultTransport } from "./vaultSync";
import { useSettingsStore } from "./settingsStore";
import { useNotesStore } from "./notesStore";
import { flushNoteSaves, reconcileActiveNoteBuffer } from "./noteAutosave";
import { showToast } from "./toast";

/**
 * Vault sync controller (issue #21) — the seam between the UI and the sync
 * engine. Chooses the transport origin per platform, runs create/link/sync
 * against the live LocalNotesPort, refreshes the in-memory library, and
 * persists the (non-secret) settings. The passphrase is passed in per call
 * and never retained here — the UI re-collects it every time by design.
 */

/** The transport chooses a fixed origin for native shells and same-origin
    requests for deployed web. */
function transport(): VaultTransport {
  return createHttpVaultTransport(resolveVaultBaseUrl());
}

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

/** Create a brand-new vault from this device's current library. Returns the
    vault id (the user's "Sync code"). */
export async function enableSync(passphrase: string): Promise<string> {
  await flushBeforeSync();
  const { vaultId } = await createVault(passphrase, createLocalNotesPort(), transport());
  await persist({ syncEnabled: true, syncVaultId: vaultId, lastSyncedAt: Date.now() });
  showToast("Cloud sync enabled");
  return vaultId;
}

/** Join an existing vault by its sync code: pull + merge into this device. */
export async function linkDevice(vaultId: string, passphrase: string): Promise<SyncOutcome> {
  await flushBeforeSync();
  const outcome = await syncVault(passphrase, vaultId, createLocalNotesPort(), transport());
  await useNotesStore.getState().reloadLibrary();
  reconcileActiveNoteBuffer();
  await persist({ syncEnabled: true, syncVaultId: vaultId, lastSyncedAt: Date.now() });
  showToast(outcome.pulled ? `Linked — ${outcome.pulled} notes pulled` : "Device linked");
  return outcome;
}

/** Run a full sync cycle against the already-configured vault. */
export async function syncNow(passphrase: string): Promise<SyncOutcome> {
  const vaultId = useSettingsStore.getState().syncVaultId;
  if (!vaultId) throw new Error("Cloud sync isn't set up on this device yet.");
  await flushBeforeSync();
  const outcome = await syncVault(passphrase, vaultId, createLocalNotesPort(), transport());
  await useNotesStore.getState().reloadLibrary();
  reconcileActiveNoteBuffer();
  await persist({ lastSyncedAt: Date.now() });
  showToast(outcome.pulled ? `Synced — ${outcome.pulled} updated` : "Up to date");
  return outcome;
}

/** Stop syncing on THIS device. The vault and its data remain in the cloud;
    other devices are unaffected. The passphrase was never stored, so there's
    nothing secret to clear — and the local notes stay on disk by design
    (this app is local-first; "turn off" is not a local wipe). */
export async function disableSync(): Promise<void> {
  await persist({ syncEnabled: false, syncVaultId: null, lastSyncedAt: null });
  showToast("Cloud sync turned off on this device");
}

export { PROD_ORIGIN };
