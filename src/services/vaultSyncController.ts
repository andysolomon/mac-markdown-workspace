import { createHttpVaultTransport } from "./vaultHttpTransport";
import { createLocalNotesPort } from "./localNotesPort";
import { createVault, syncVault, type SyncOutcome, type VaultTransport } from "./vaultSync";
import { useSettingsStore } from "./settingsStore";
import { useNotesStore } from "./notesStore";
import { showToast } from "./toast";

/**
 * Vault sync controller (issue #21) — the seam between the UI and the sync
 * engine. Chooses the transport origin per platform, runs create/link/sync
 * against the live LocalNotesPort, refreshes the in-memory library, and
 * persists the (non-secret) settings. The passphrase is passed in per call
 * and never retained here — the UI re-collects it every time by design.
 */

/** iOS is served from capacitor://, so it must call the API by absolute
    origin; web is same-origin. */
const PROD_ORIGIN = "https://mac-markdown-workspace.vercel.app";

function isCapacitor(): boolean {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

function transport(): VaultTransport {
  return createHttpVaultTransport(isCapacitor() ? PROD_ORIGIN : "");
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

/** Create a brand-new vault from this device's current library. Returns the
    vault id (the user's "Sync code"). */
export async function enableSync(passphrase: string): Promise<string> {
  const { vaultId } = await createVault(passphrase, createLocalNotesPort(), transport());
  await persist({ syncEnabled: true, syncVaultId: vaultId, lastSyncedAt: Date.now() });
  showToast("Cloud sync enabled");
  return vaultId;
}

/** Join an existing vault by its sync code: pull + merge into this device. */
export async function linkDevice(vaultId: string, passphrase: string): Promise<SyncOutcome> {
  const outcome = await syncVault(passphrase, vaultId, createLocalNotesPort(), transport());
  await useNotesStore.getState().reloadLibrary();
  await persist({ syncEnabled: true, syncVaultId: vaultId, lastSyncedAt: Date.now() });
  showToast(outcome.pulled ? `Linked — ${outcome.pulled} notes pulled` : "Device linked");
  return outcome;
}

/** Run a full sync cycle against the already-configured vault. */
export async function syncNow(passphrase: string): Promise<SyncOutcome> {
  const vaultId = useSettingsStore.getState().syncVaultId;
  if (!vaultId) throw new Error("Cloud sync isn't set up on this device yet.");
  const outcome = await syncVault(passphrase, vaultId, createLocalNotesPort(), transport());
  await useNotesStore.getState().reloadLibrary();
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
