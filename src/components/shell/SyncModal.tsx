import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore } from "../../services/settingsStore";
import { MIN_PASSPHRASE_LENGTH } from "../../services/vaultSync";
import { enableSync, linkDevice, syncNow, disableSync } from "../../services/vaultSyncController";

type View = "intro" | "enable" | "link" | "sync" | "manage";

function isCapacitor(): boolean {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

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
  const dialogRef = useRef<HTMLDivElement>(null);

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

  // Escape closes (never mid-operation); Tab is trapped within the dialog so
  // focus can't wander into the app behind an aria-modal dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    // Yield one frame so the "Encrypting…"/"Syncing…" label actually paints
    // before scrypt (N=2^17, synchronous) blocks the main thread for ~1-2s.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
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

  const onSubmit = (fn: () => void) => (e: React.FormEvent) => {
    e.preventDefault();
    if (!busy) fn();
  };

  const errorNode = error ? (
    <p className="mm-sync-error" aria-live="assertive">
      {error}
    </p>
  ) : null;

  return (
    <div className="mm-modal-scrim" onMouseDown={() => !busy && onClose()}>
      <div
        className="mm-modal mm-sync-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mm-sync-title"
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="mm-modal-head">
          <h2 id="mm-sync-title">Cloud Sync</h2>
          <button
            type="button"
            className="mm-modal-x"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {view === "intro" ? (
          <div className="mm-modal-body">
            <p className="mm-sync-lede">
              Sync your notes across devices with end-to-end encryption. Your passphrase never
              leaves this device — the server only ever stores ciphertext.
            </p>
            {isCapacitor() ? (
              <p className="mm-sync-note">
                Different from the <strong>iCloud</strong> storage option: iCloud only backs up
                files within your Apple devices and isn't end-to-end encrypted by this app. Cloud
                Sync works across web, desktop, and iOS, encrypted so that only your passphrase can
                unlock it.
              </p>
            ) : null}
            <p className="mm-sync-note">
              The catch: your passphrase is the only key to your notes, and{" "}
              <strong>a lost passphrase can't be recovered</strong>. Keep it somewhere safe.
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
          <form className="mm-modal-body" onSubmit={onSubmit(doEnable)}>
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
            {errorNode}
            <div className="mm-modal-actions">
              <button type="submit" className="mm-btn-primary" disabled={busy}>
                {busy ? "Encrypting…" : "Create vault"}
              </button>
              <button
                type="button"
                className="mm-btn-ghost"
                onClick={() => setView("intro")}
                disabled={busy}
              >
                Back
              </button>
            </div>
          </form>
        ) : null}

        {view === "link" ? (
          <form className="mm-modal-body" onSubmit={onSubmit(doLink)}>
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
            {errorNode}
            <div className="mm-modal-actions">
              <button type="submit" className="mm-btn-primary" disabled={busy}>
                {busy ? "Linking…" : "Link device"}
              </button>
              <button
                type="button"
                className="mm-btn-ghost"
                onClick={() => setView("intro")}
                disabled={busy}
              >
                Back
              </button>
            </div>
          </form>
        ) : null}

        {view === "sync" ? (
          <form className="mm-modal-body" onSubmit={onSubmit(doSync)}>
            <p className="mm-sync-note">Enter your passphrase to sync this device.</p>
            <label className="mm-field">
              <span>Passphrase</span>
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </label>
            {errorNode}
            <div className="mm-modal-actions">
              <button type="submit" className="mm-btn-primary" disabled={busy || !passphrase}>
                {busy ? "Syncing…" : "Sync now"}
              </button>
              <button
                type="button"
                className="mm-btn-ghost"
                onClick={enabled ? () => setView("manage") : onClose}
                disabled={busy}
              >
                {enabled ? "Back" : "Cancel"}
              </button>
            </div>
          </form>
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
            {errorNode}
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
