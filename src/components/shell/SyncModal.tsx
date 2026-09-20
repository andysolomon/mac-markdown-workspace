import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatPairingCode } from "../../../shared/pairingCode";
import { useSyncStatusStore } from "../../services/ambientSync";
import { useSettingsStore } from "../../services/settingsStore";
import { MIN_PASSPHRASE_LENGTH } from "../../services/vaultSync";
import {
  disableSync,
  enableSync,
  hasResidentKeys,
  linkDevice,
  mintPairingCode,
  rememberStrategy,
  syncNow,
  type RememberStrategy,
} from "../../services/vaultSyncController";

type View = "intro" | "enable" | "link" | "unlock" | "manage" | "pair" | "pair-unlock";

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

function countdown(expiresAt: number, now: number): string {
  const left = Math.max(0, Math.round((expiresAt - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const REMEMBER_COPY: Record<RememberStrategy, string> = {
  host: "Your keys are sealed by this device's keychain. Sync runs in the background and never asks for the passphrase again here.",
  browser:
    "This browser keeps a non-extractable copy of your key so sync runs in the background. Anyone with access to this browser profile could overwrite your synced notes — but never read them.",
  none: "This device can't keep keys; it will ask for the passphrase each time.",
};

/**
 * Cloud Sync modal (issue #21, reshaped by docs/ambient-vault-sync.md).
 *
 * Collects the passphrase — never stored — for the acts that need it:
 * creating a vault, linking by pairing code, unlocking a device that didn't
 * remember its keys, or minting a pairing code on such a device. Everything
 * else (the ambient loop, "Sync now" on a remembered device) runs without
 * a prompt. `autoSync` opens straight onto the unlock prompt for a locked
 * device (the topbar indicator uses it).
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
  const status = useSyncStatusStore((s) => s.status);
  const statusError = useSyncStatusStore((s) => s.error);

  const initialView: View = useMemo(
    () => (enabled ? (autoSync ? "unlock" : "manage") : "intro"),
    [enabled, autoSync],
  );
  const [view, setView] = useState<View>(initialView);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [strategy, setStrategy] = useState<RememberStrategy>("none");
  const [resident, setResident] = useState<boolean | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Re-derive the entry view each time the modal opens; wipe secrets on close.
  useEffect(() => {
    if (open) {
      setView(initialView);
      void rememberStrategy().then(setStrategy);
      void hasResidentKeys().then(setResident);
    } else {
      setPassphrase("");
      setConfirm("");
      setCode("");
      setError(null);
      setBusy(false);
      setCopied(false);
      setPairing(null);
      setResident(null);
    }
  }, [open, initialView]);

  // Tick the pairing countdown while a code is showing.
  useEffect(() => {
    if (!open || !pairing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, pairing]);

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

  const canRemember = strategy !== "none";

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
      await enableSync(passphrase, remember && canRemember);
      setPassphrase("");
      setConfirm("");
      setResident(remember && canRemember);
      setView("manage");
    });

  const doLink = () =>
    run(async () => {
      if (!code.trim()) throw new Error("Enter the pairing code from your other device.");
      if (!passphrase) throw new Error("Enter the passphrase you chose on your other device.");
      await linkDevice(code, passphrase, remember && canRemember);
      setPassphrase("");
      setCode("");
      onClose();
    });

  const doUnlock = () =>
    run(async () => {
      await syncNow(passphrase, remember && canRemember);
      setPassphrase("");
      onClose();
    });

  const doSyncNow = () =>
    run(async () => {
      if (resident === false) {
        setView("unlock");
        return;
      }
      await syncNow();
    });

  const doMint = (withPassphrase?: string) =>
    run(async () => {
      const minted = await mintPairingCode(withPassphrase);
      setPassphrase("");
      setPairing(minted);
      setNow(Date.now());
      setView("pair");
    });

  const startPairing = () => {
    if (resident === false) setView("pair-unlock");
    else void doMint();
  };

  const doDisable = () =>
    run(async () => {
      await disableSync();
      setView("intro");
    });

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
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

  const rememberNode = (
    <label className="mm-check">
      <input
        type="checkbox"
        checked={remember && canRemember}
        disabled={!canRemember}
        onChange={(e) => setRemember(e.target.checked)}
      />
      <span>
        Remember this device
        <p className="mm-sync-note">{REMEMBER_COPY[strategy]}</p>
      </span>
    </label>
  );

  const statusLine = (() => {
    switch (status) {
      case "syncing":
        return "Syncing…";
      case "offline":
        return `Offline — will sync when the connection is back. Last synced ${relativeTime(lastSyncedAt)}.`;
      case "error":
        return `Sync problem: ${statusError ?? "unknown"}. Retrying.`;
      case "locked":
        return `Locked — enter your passphrase to sync this device. Last synced ${relativeTime(lastSyncedAt)}.`;
      case "idle":
        return `Up to date. Last synced ${relativeTime(lastSyncedAt)}.`;
      default:
        return `Last synced ${relativeTime(lastSyncedAt)}.`;
    }
  })();

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
              Keep your notes in sync across devices with end-to-end encryption. Edits sync in the
              background; your passphrase never leaves this device and the server only ever
              stores ciphertext.
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
                I have a pairing code
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
            {rememberNode}
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
              On a device that's already syncing, open Cloud Sync and choose{" "}
              <strong>Pair a device</strong>. Enter the code it shows here, plus the passphrase
              you chose there. Codes last ten minutes.
            </p>
            <label className="mm-field">
              <span>Pairing code</span>
              <input
                type="text"
                autoFocus
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="K7F2-M9QX"
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
            {rememberNode}
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

        {view === "unlock" ? (
          <form className="mm-modal-body" onSubmit={onSubmit(doUnlock)}>
            <p className="mm-sync-note">
              This device hasn't kept its sync keys. Enter your passphrase to sync it now.
            </p>
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
            {rememberNode}
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
            <p className="mm-sync-status-line" aria-live="polite">
              <span
                className={`mm-sync-status${status === "idle" || status === "syncing" ? " on" : ""}`}
              >
                {status === "locked" ? "Locked" : status === "off" ? "On" : status}
              </span>
              <span>{statusLine}</span>
            </p>
            <p className="mm-sync-note">
              To add another device, pair it: it gets a short code that's good for ten minutes.
              {resident === false
                ? " This device hasn't kept its keys, so pairing and syncing will ask for your passphrase."
                : ""}
            </p>
            {errorNode}
            <div className="mm-modal-actions">
              <button type="button" className="mm-btn-primary" onClick={startPairing} disabled={busy}>
                {busy ? "Working…" : "Pair a device"}
              </button>
              <button type="button" className="mm-btn-ghost" onClick={doSyncNow} disabled={busy}>
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
            {vaultId ? (
              <p className="mm-sync-note">
                <span style={{ opacity: 0.7 }}>Vault </span>
                <code style={{ fontSize: 11 }}>{vaultId}</code>
              </p>
            ) : null}
          </div>
        ) : null}

        {view === "pair-unlock" ? (
          <form className="mm-modal-body" onSubmit={onSubmit(() => doMint(passphrase))}>
            <p className="mm-sync-note">
              Enter your passphrase to create a pairing code. It's used once, right now, and not
              kept.
            </p>
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
                {busy ? "Working…" : "Get pairing code"}
              </button>
              <button
                type="button"
                className="mm-btn-ghost"
                onClick={() => setView("manage")}
                disabled={busy}
              >
                Back
              </button>
            </div>
          </form>
        ) : null}

        {view === "pair" && pairing ? (
          <div className="mm-modal-body">
            <p className="mm-sync-note">
              On the other device, open Cloud Sync → <strong>I have a pairing code</strong>, enter
              this code and your passphrase.
            </p>
            <code className="mm-pair-code" data-testid="pairing-code">
              {formatPairingCode(pairing.code)}
            </code>
            <p className="mm-sync-note" aria-live="polite">
              {pairing.expiresAt > now ? (
                <>
                  Expires in <span className="mm-pair-expiry">{countdown(pairing.expiresAt, now)}</span>.
                  Works once.
                </>
              ) : (
                "This code has expired."
              )}
            </p>
            {errorNode}
            <div className="mm-modal-actions">
              {pairing.expiresAt > now ? (
                <button
                  type="button"
                  className="mm-btn-primary"
                  onClick={() => void copyText(formatPairingCode(pairing.code))}
                >
                  {copied ? "Copied" : "Copy code"}
                </button>
              ) : (
                <button type="button" className="mm-btn-primary" onClick={startPairing} disabled={busy}>
                  New code
                </button>
              )}
              <button
                type="button"
                className="mm-btn-ghost"
                onClick={() => {
                  setPairing(null);
                  setView("manage");
                }}
                disabled={busy}
              >
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
