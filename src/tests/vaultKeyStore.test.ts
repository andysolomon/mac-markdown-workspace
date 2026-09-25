import { describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  createHostKeyStore,
  createIndexedDbKeyStore,
  createVaultKeyStore,
} from "../services/vaultKeyStore";
import { decryptSnapshot, encryptSnapshot } from "../services/vaultCrypto";

const VAULT = "vlt_123e4567-e89b-12d3-a456-426614174000";
const RAW = new Uint8Array(32).map((_, i) => i + 1);

function fakeSecureApi(available = true) {
  const store = new Map<string, string>();
  return {
    store,
    api: {
      secureAvailable: vi.fn(async () => available),
      secureGet: vi.fn(async (key: string) => store.get(key) ?? null),
      secureSet: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      secureDelete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
}

describe("host key store (Electron safeStorage / iOS Keychain)", () => {
  it("round-trips derived material through the secure* surface as a usable key", async () => {
    const { api, store } = fakeSecureApi();
    const ks = createHostKeyStore(api);
    expect(await ks.available()).toBe(true);
    expect(await ks.strategy()).toBe("host");

    await ks.remember(VAULT, { encryptionKey: RAW.slice(), writeToken: "tok" });
    // What went to the host is derived material only — never a passphrase.
    const stored = JSON.parse([...store.values()][0]);
    expect(stored).toMatchObject({ v: 1, wt: "tok" });
    expect(stored.enc).toMatch(/^[0-9a-f]{64}$/);

    const recalled = await ks.recall(VAULT);
    if (!recalled) throw new Error("expected keys to be recalled");
    expect(recalled.writeToken).toBe("tok");
    expect(recalled.encryptionKey.extractable).toBe(false);
    // The recalled handle decrypts what the raw bytes encrypted.
    const env = await encryptSnapshot(RAW, VAULT, "hello");
    await expect(decryptSnapshot(recalled.encryptionKey, VAULT, env)).resolves.toBe("hello");

    await ks.forget(VAULT);
    expect(await ks.recall(VAULT)).toBeNull();
  });
});

describe("IndexedDB key store (web)", () => {
  it("stores a non-extractable CryptoKey and recalls it", async () => {
    const ks = createIndexedDbKeyStore(new IDBFactory());
    expect(await ks.available()).toBe(true);
    expect(await ks.strategy()).toBe("browser");
    await ks.remember(VAULT, { encryptionKey: RAW.slice(), writeToken: "tok" });
    const recalled = await ks.recall(VAULT);
    if (!recalled) throw new Error("expected keys to be recalled");
    expect(recalled.writeToken).toBe("tok");
    expect(recalled.encryptionKey.extractable).toBe(false);
    const env = await encryptSnapshot(RAW, VAULT, "hello");
    await expect(decryptSnapshot(recalled.encryptionKey, VAULT, env)).resolves.toBe("hello");
    await ks.forget(VAULT);
    expect(await ks.recall(VAULT)).toBeNull();
  });
});

describe("createVaultKeyStore strategy selection", () => {
  it("prefers the host when it reports available", async () => {
    const { api } = fakeSecureApi(true);
    const ks = createVaultKeyStore(api, new IDBFactory());
    expect(await ks.strategy()).toBe("host");
    await ks.remember(VAULT, { encryptionKey: RAW.slice(), writeToken: "tok" });
    expect(api.secureSet).toHaveBeenCalledTimes(1);
  });

  it("falls back to IndexedDB when the host says no (e.g. Linux without a keyring)", async () => {
    const { api } = fakeSecureApi(false);
    const ks = createVaultKeyStore(api, new IDBFactory());
    expect(await ks.strategy()).toBe("browser");
    await ks.remember(VAULT, { encryptionKey: RAW.slice(), writeToken: "tok" });
    expect(api.secureSet).not.toHaveBeenCalled();
    expect((await ks.recall(VAULT))?.writeToken).toBe("tok");
  });
});
