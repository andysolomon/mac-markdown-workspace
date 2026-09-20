import type { VaultEnvelope } from "./vaultCrypto";
import {
  VaultConflictError,
  type RemoteNotModified,
  type RemoteSnapshot,
  type VaultMeta,
  type VaultTransport,
} from "./vaultSync";

/** The only remote origin native shells may use for vault traffic. */
export const PROD_ORIGIN = "https://mac-markdown-workspace.vercel.app";

export interface VaultRuntimeIdentity {
  protocol?: string;
  userAgent?: string;
  capacitor?: boolean;
}

/**
 * Resolve the vault API origin without accepting a user-controlled destination.
 * Deployed web stays same-origin; Electron (including Vite development and
 * packaged file://), Capacitor, and other non-web shells use the allowlisted
 * production API origin.
 */
export function resolveVaultBaseUrl(runtime: VaultRuntimeIdentity = {}): string {
  const protocol =
    runtime.protocol ?? (typeof window !== "undefined" ? window.location.protocol : "");
  const userAgent =
    runtime.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const capacitor =
    runtime.capacitor ??
    (typeof window !== "undefined" &&
      (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ===
        true);

  if (capacitor || protocol === "file:" || protocol === "capacitor:" || /Electron/i.test(userAgent)) {
    return PROD_ORIGIN;
  }
  return "";
}

/**
 * HTTP implementation of VaultTransport against the Phase B API
 * (issue #20 / W-000020, api/vault/*).
 *
 * baseUrl is "" on deployed web (same origin); native shells pass the
 * allowlisted production origin. The write token travels as a Bearer header
 * and only ever to our API; the passphrase never appears here at all.
 */
export function createHttpVaultTransport(baseUrl = ""): VaultTransport {
  const url = (path: string): string => `${baseUrl}/api/vault${path}`;

  return {
    async createVault({ vaultId, writeTokenHash }) {
      const res = await fetch(url(""), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId, writeTokenHash }),
      });
      if (res.status === 409) throw new Error("A vault with this id already exists.");
      if (!res.ok) throw new Error(`Vault creation failed (${res.status})`);
    },

    async getMeta(vaultId) {
      const res = await fetch(url(`/${vaultId}/meta`));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Vault meta fetch failed (${res.status})`);
      return (await res.json()) as VaultMeta;
    },

    async getSnapshot(vaultId, opts): Promise<RemoteSnapshot | RemoteNotModified | null> {
      const headers: Record<string, string> = {};
      // Custom name: Vercel's edge consumes the standard If-None-Match.
      if (opts?.ifNoneMatch) headers["x-vault-if-none-match"] = opts.ifNoneMatch;
      const res = await fetch(url(`/${vaultId}/snapshot`), { headers });
      if (res.status === 304 && opts?.ifNoneMatch) {
        return { notModified: true, etag: res.headers.get("etag") ?? opts.ifNoneMatch };
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Vault download failed (${res.status})`);
      const envelope = (await res.json()) as VaultEnvelope;
      return { envelope, etag: res.headers.get("etag") };
    },

    async putSnapshot(vaultId, writeToken, envelope, opts) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${writeToken}`,
      };
      if (opts && opts.ifMatch !== undefined) {
        // Custom names: Vercel's edge consumes standard conditional headers.
        if (opts.ifMatch === null) headers["x-vault-if-none-match"] = "*";
        else headers["x-vault-if-match"] = opts.ifMatch;
      }
      const res = await fetch(url(`/${vaultId}/snapshot`), {
        method: "PUT",
        headers,
        body: JSON.stringify(envelope),
      });
      if (res.status === 412) throw new VaultConflictError();
      if (res.status === 401 || res.status === 403) {
        throw new Error("This device's write token was rejected — wrong passphrase?");
      }
      if (res.status === 413) {
        throw new Error("This library is too large to sync (snapshot exceeds the size limit).");
      }
      if (res.status === 404) {
        throw new Error("This vault no longer exists on the server.");
      }
      if (!res.ok) throw new Error(`Vault upload failed (${res.status})`);
      return { etag: res.headers.get("etag") };
    },

    async createPairing(vaultId, writeToken) {
      const res = await fetch(url("/pair"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${writeToken}`,
        },
        body: JSON.stringify({ vaultId }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error("This device's write token was rejected — sync it once with the passphrase first.");
      }
      if (res.status === 404) throw new Error("This vault no longer exists on the server.");
      if (!res.ok) throw new Error(`Couldn't create a pairing code (${res.status})`);
      return (await res.json()) as { code: string; expiresAt: number };
    },

    async redeemPairing(code) {
      const res = await fetch(url("/pair/redeem"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.status === 404 || res.status === 410) {
        throw new Error("That pairing code isn't valid any more — codes last ten minutes and work once.");
      }
      if (res.status === 429) throw new Error("Too many attempts — wait a minute and try again.");
      if (!res.ok) throw new Error(`Pairing failed (${res.status})`);
      return (await res.json()) as { vaultId: string };
    },
  };
}
