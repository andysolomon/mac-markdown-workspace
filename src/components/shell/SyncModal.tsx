import React, { useEffect, useMemo, useState } from "react";
import { useSettingsStore } from "../../services/settingsStore";
import { MIN_PASSPHRASE_LENGTH } from "../../services/vaultSync";
import { enableSync, linkDevice, syncNow, disableSync } from "../../services/vaultSyncController";

type View = "intro" | "enable" | "link" | "sync" | "manage";

function relativeTime(ts: number | null): string {
  if (!ts) return "never";
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Cloud Sync modal (issue #21). Collects the passphrase — which is never
 * stored — and drives enable / link / sync / manage through the controller.
 * `autoSync` jumps a configured device straight to the passphrase prompt
 * (used by the on-focus auto-sync nudge).
 */
export function SyncModal({
  open,
  onClose,
  autoSync = false,
}: {
  open: boolean;
  onClose: () => void;
  autoSync?: boolean;
}) {
  const enabled = useSettingsStore((s) => s.syncEnabled);
  const vaultId = useSettingsStore((s) => s.syncVaultId);
  const lastSyncedAt = useSettingsStore((s) => s.lastSyncedAt);

  const initialView: View = useMemo(
    () => (enabled ? (autoSync ? "sync" : "manage") : "intro"),
    [enabled, autoSync],
  );
  const [view, setView] = useState<View>(initialView);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Re-derive the entry view each time the modal opens; wipe secrets on close.
  useEffect(() => {
    if (open) {
      setView(initialView);
    } else {
      setPassphrase("");
      setConfirm("");
      setCode("");
      setError(null);
      setBusy(false);
      setCopied(false);
    }
  }, [open, initialView]);

  if (!open) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const doEnable = () =>
    run(async () => {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH)
        throw new Error(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      if (passphrase !== confirm) throw new Error("Passphrases don't match.");
      await enableSync(passphrase);
      setPassphrase("");
      setConfirm("");
      setView("manage");
    });

  const doLink = () =>
    run(async () => {
      if (!/^vlt_[0-9a-f-]{36}$/.test(code.trim()))
        throw new Error("That doesn't look like a sync code.");
      await linkDevice(code.trim(), passphrase);
      setPassphrase("");
      setCode("");
      onClose();
    });

  const doSync = () =>
    run(async () => {
      await syncNow(passphrase);
      setPassphrase("");
      onClose();
    });

  const doDisable = () =>
    run(async () => {
      await disableSync();
      setView("intro");
    });

  const copyCode = async () => {
    if (!vaultId) return;
    try {
      await navigator.clipboard.writeText(vaultId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is visible to copy by hand */
    }
  };

  return (
    <div className="mm-modal-scrim" onMouseDown={onClose}>
      <div
        className="mm-modal mm-sync-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Cloud Sync"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="mm-modal-head">
          <h2>Cloud Sync</h2>
          <button type="button" className="mm-modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {view === "intro" ? (
          <div className="mm-modal-body">
            <p className="mm-sync-lede">
              Sync your notes across devices with end-to-end encryption. Your passphrase never
              leaves this device — the server only ever stores ciphertext.
            </p>
            <p className="mm-sync-note">
              This is separate from the iOS <strong>iCloud</strong> storage option: iCloud keeps a
              copy of your files in Apple's cloud, but doesn't reliably sync edits between an iPad
              and iPhone. Cloud Sync does, on any platform — at the cost of a passphrase you must
              remember, because <strong>lost passphrases can't be recovered</strong>.
            </p>
            <div className="mm-modal-actions">
              <button type="button" className="mm-btn-primary" onClick={() => setView("enable")}>
                Enable sync
              </button>
              <button type="button" className="mm-btn-ghost" onClick={() => setView("link")}>
                I have a sync code
              </button>
            </div>
          </div>
        ) : null}

        {view === "enable" ? (
          <div className="mm-modal-body">
            <p className="mm-sync-note">
              Choose a strong passphrase. It's the only key to your notes — write it down
              somewhere safe. It's never stored or sent anywhere.
            </p>
            <label className="mm-field">
              <span>Passphrase</span>
              <input
                type="password"
                autoFocus
                autoComplete="new-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters`}
              />
            </label>
            <label className="mm-field">
              <span>Confirm passphrase</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error ? <p className="mm-sync-error">{error}</p> : null}
            <div className="mm-modal-actions">
              <button
                type="button"
                className="mm-btn-primary"
                onClick={doEnable}
                disabled={busy}
              >
                {busy ? "Encrypting…" : "Create vault"}
              </button>
              <button type="button" className="mm-btn-ghost" onClick={() => setView("intro")}>
                Back
              </button>
            </div>
          </div>
        ) : null}

        {view === "link" ? (
          <div className="mm-modal-body">
            <p className="mm-sync-note">
              Enter the sync code from your other device, plus the passphrase you chose there.
            </p>
            <label className="mm-field">
              <span>Sync code</span>
              <input
                type="text"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="vlt_…"
              />
            </label>
            <label className="mm-field">
              <span>Passphrase</span>
              <input
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </label>
            {error ? <p className="mm-sync-error">{error}</p> : null}
            <div className="mm-modal-actions">
              <button type="button" className="mm-btn-primary" onClick={doLink} disabled={busy}>
                {busy ? "Linking…" : "Link device"}
              </button>
              <button type="button" className="mm-btn-ghost" onClick={() => setView("intro")}>
                Back
              </button>
            </div>
          </div>
        ) : null}

        {view === "sync" ? (
          <div className="mm-modal-body">
            <p className="mm-sync-note">Enter your passphrase to sync this device.</p>
            <label className="mm-field">
              <span>Passphrase</span>
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && passphrase && !busy) doSync();
                }}
              />
            </label>
            {error ? <p className="mm-sync-error">{error}</p> : null}
            <div className="mm-modal-actions">
              <button type="button" className="mm-btn-primary" onClick={doSync} disabled={busy}>
                {busy ? "Syncing…" : "Sync now"}
              </button>
              <button
                type="button"
                className="mm-btn-ghost"
                onClick={enabled ? () => setView("manage") : onClose}
              >
                {enabled ? "Back" : "Cancel"}
              </button>
            </div>
          </div>
        ) : null}

        {view === "manage" ? (
          <div className="mm-modal-body">
            <label className="mm-field">
              <span>Sync code</span>
              <div className="mm-code-row">
                <code className="mm-sync-code">{vaultId}</code>
                <button type="button" className="mm-btn-ghost mm-btn-small" onClick={copyCode}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </label>
            <p className="mm-sync-note">
              Enter this code and your passphrase on another device to sync it. Last synced{" "}
              {relativeTime(lastSyncedAt)}.
            </p>
            {error ? <p className="mm-sync-error">{error}</p> : null}
            <div className="mm-modal-actions">
              <button type="button" className="mm-btn-primary" onClick={() => setView("sync")}>
                Sync now
              </button>
              <button
                type="button"
                className="mm-btn-ghost mm-btn-danger"
                onClick={doDisable}
                disabled={busy}
              >
                Turn off sync
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
