import React from "react";
import { useSyncStatusStore, type AmbientStatus } from "../../services/ambientSync";
import { openSyncModal } from "./SettingsPanel";

const LABELS: Record<AmbientStatus, string> = {
  off: "",
  locked: "Sync locked",
  idle: "Synced",
  syncing: "Syncing…",
  offline: "Offline",
  error: "Sync error",
};

/**
 * Quiet sync status in the topbar (docs/ambient-vault-sync.md, Part 3):
 * the ambient loop reports here instead of opening a modal. Clicking opens
 * the Cloud Sync modal — straight to the passphrase prompt when locked.
 * Renders nothing while sync is off, so the chrome is unchanged for users
 * who never enabled it.
 */
export const SyncIndicator = React.memo(function SyncIndicator() {
  const status = useSyncStatusStore((s) => s.status);
  const error = useSyncStatusStore((s) => s.error);
  if (status === "off") return null;
  const label = LABELS[status];
  const title = status === "error" && error ? `${label}: ${error}` : label;
  return (
    <button
      type="button"
      className="mm-sync-indicator"
      data-status={status}
      data-testid="sync-indicator"
      title={title}
      aria-label={title}
      onClick={() => openSyncModal(status === "locked")}
    >
      <span className="mm-sync-dot" aria-hidden="true" />
      <span className="mm-sync-label">{label}</span>
    </button>
  );
});
