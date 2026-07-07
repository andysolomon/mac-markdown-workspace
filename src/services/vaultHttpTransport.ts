import type { VaultEnvelope } from "./vaultCrypto";
import {
  VaultConflictError,
  type RemoteSnapshot,
  type VaultMeta,
  type VaultTransport,
} from "./vaultSync";

/**
 * HTTP implementation of VaultTransport against the Phase B API
 * (issue #20 / W-000020, api/vault/*).
 *
 * baseUrl is "" on the web (same origin); the iOS build must pass the
 * absolute production origin since Capacitor serves from capacitor://.
 * The write token travels as a Bearer header and only ever to our API;
 * the passphrase never appears here at all.
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

    async getSnapshot(vaultId): Promise<RemoteSnapshot | null> {
      const res = await fetch(url(`/${vaultId}/snapshot`));
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
    },
  };
}
