import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { AppApi } from "../../shared/types/ipc";
import { importEncryptionKey } from "./vaultCrypto";

/**
 * Resident keys (docs/ambient-vault-sync.md, Part 1) — what a device
 * remembers so it can sync without the passphrase.
 *
 * NEVER the passphrase. Only the material deriveVaultKeys produces:
 * - the AES-256-GCM encryption key, handed back as a CryptoKey handle that
 *   is non-extractable wherever the platform lets us make it so;
 * - the write token, which has to stay a string because it becomes an
 *   `Authorization: Bearer` header value.
 *
 * Two strategies, chosen once per session:
 * - HOST: the shim exposes `secure*` (Electron safeStorage, iOS Keychain).
 *   The material is serialized and sealed by the OS; recall re-imports the
 *   key non-extractable.
 * - INDEXEDDB: no OS keychain (web, or Electron on a Linux box with no
 *   keyring). The CryptoKey is structured-cloned into IndexedDB
 *   non-extractable — script can use it, never read it. The write token
 *   sits beside it in the clear: same-origin XSS could overwrite the vault's
 *   ciphertext, never read a note. The UI copy says so.
 *
 * `available()` false is a supported state: the app falls back to the
 * passphrase prompt exactly as before.
 */

export interface ResidentKeys {
  /** Usable for AES-GCM; non-extractable on web, OS-sealed elsewhere. */
  encryptionKey: CryptoKey;
  writeToken: string;
}

export interface RememberableKeys {
  encryptionKey: Uint8Array;
  writeToken: string;
}

export type KeyStoreStrategy = "host" | "browser" | "none";

export interface VaultKeyStore {
  available(): Promise<boolean>;
  /** Which storage would hold the keys: an OS keychain ("host"), the
      browser's IndexedDB ("browser"), or nothing. Drives the UI copy about
      what a remembered device exposes. */
  strategy(): Promise<KeyStoreStrategy>;
  /** Persist derived material for `vaultId`. The caller still owns the raw
      bytes it passed in and should zero them afterwards. */
  remember(vaultId: string, keys: RememberableKeys): Promise<void>;
  recall(vaultId: string): Promise<ResidentKeys | null>;
  forget(vaultId: string): Promise<void>;
}

const HOST_KEY_PREFIX = "vault-keys:";

interface HostRecord {
  v: 1;
  enc: string;
  wt: string;
}

/** Strategy 1: host secure storage through the AppApi `secure*` surface. */
export function createHostKeyStore(api: Pick<AppApi, "secureAvailable" | "secureGet" | "secureSet" | "secureDelete">): VaultKeyStore {
  const keyFor = (vaultId: string) => `${HOST_KEY_PREFIX}${vaultId}`;
  return {
    async available() {
      if (!api.secureAvailable || !api.secureGet || !api.secureSet || !api.secureDelete) return false;
      try {
        return await api.secureAvailable();
      } catch {
        return false;
      }
    },
    strategy: async () => "host",
    async remember(vaultId, keys) {
      if (!api.secureSet) throw new Error("Secure storage is not available on this device.");
      const record: HostRecord = { v: 1, enc: bytesToHex(keys.encryptionKey), wt: keys.writeToken };
      await api.secureSet(keyFor(vaultId), JSON.stringify(record));
    },
    async recall(vaultId) {
      if (!api.secureGet) return null;
      const raw = await api.secureGet(keyFor(vaultId));
      if (!raw) return null;
      let record: Partial<HostRecord>;
      try {
        record = JSON.parse(raw) as Partial<HostRecord>;
      } catch {
        return null;
      }
      if (record.v !== 1 || typeof record.enc !== "string" || typeof record.wt !== "string") {
        return null;
      }
      const bytes = hexToBytes(record.enc);
      try {
        return { encryptionKey: await importEncryptionKey(bytes, false), writeToken: record.wt };
      } finally {
        bytes.fill(0);
      }
    },
    async forget(vaultId) {
      await api.secureDelete?.(keyFor(vaultId));
    },
  };
}

const IDB_NAME = "mmw-vault-keys";
const IDB_STORE = "keys";

interface IdbRecord {
  vaultId: string;
  encryptionKey: CryptoKey;
  writeToken: string;
  rememberedAt: number;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Strategy 2: a non-extractable CryptoKey in IndexedDB. */
/** `null` = no IndexedDB on this host; omitted = the global one. */
export function createIndexedDbKeyStore(
  indexedDbFactory: IDBFactory | null = typeof indexedDB === "undefined" ? null : indexedDB,
): VaultKeyStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (!indexedDbFactory) return Promise.reject(new Error("IndexedDB is not available."));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDbFactory.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: "vaultId" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => {
        dbPromise = null; // let a later call retry after a transient failure
      });
    }
    return dbPromise;
  };
  const store = async (mode: IDBTransactionMode): Promise<IDBObjectStore> =>
    (await open()).transaction(IDB_STORE, mode).objectStore(IDB_STORE);

  return {
    async available() {
      return indexedDbFactory !== null && typeof crypto?.subtle?.importKey === "function";
    },
    strategy: async () => "browser",
    async remember(vaultId, keys) {
      const record: IdbRecord = {
        vaultId,
        encryptionKey: await importEncryptionKey(keys.encryptionKey, false),
        writeToken: keys.writeToken,
        rememberedAt: Date.now(),
      };
      await idbRequest((await store("readwrite")).put(record));
    },
    async recall(vaultId) {
      const record = (await idbRequest((await store("readonly")).get(vaultId))) as
        | IdbRecord
        | undefined;
      if (!record || typeof record.writeToken !== "string" || !record.encryptionKey) return null;
      return { encryptionKey: record.encryptionKey, writeToken: record.writeToken };
    },
    async forget(vaultId) {
      await idbRequest((await store("readwrite")).delete(vaultId));
    },
  };
}

/** The store the app uses: host secure storage when the shim offers it and
    the host reports it usable, else the IndexedDB CryptoKey, else nothing.
    The strategy is resolved once and memoized for the session. */
export function createVaultKeyStore(
  api: Partial<AppApi> | undefined = typeof window === "undefined" ? undefined : window.appApi,
  idb: IDBFactory | null = typeof indexedDB === "undefined" ? null : indexedDB,
): VaultKeyStore {
  let chosen: Promise<VaultKeyStore | null> | null = null;
  const choose = (): Promise<VaultKeyStore | null> => {
    if (!chosen) {
      chosen = (async () => {
        if (api?.secureAvailable) {
          const host = createHostKeyStore(api as AppApi);
          if (await host.available()) return host;
        }
        const local = createIndexedDbKeyStore(idb);
        if (await local.available()) return local;
        return null;
      })();
    }
    return chosen;
  };
  return {
    async available() {
      return (await choose()) !== null;
    },
    async strategy() {
      const s = await choose();
      return s ? s.strategy() : "none";
    },
    async remember(vaultId, keys) {
      const s = await choose();
      if (!s) throw new Error("This device can't remember sync keys; it will ask for the passphrase each time.");
      await s.remember(vaultId, keys);
    },
    async recall(vaultId) {
      const s = await choose();
      if (!s) return null;
      try {
        return await s.recall(vaultId);
      } catch {
        return null; // a corrupt or unreadable record is the same as none
      }
    },
    async forget(vaultId) {
      const s = await choose();
      await s?.forget(vaultId);
    },
  };
}
