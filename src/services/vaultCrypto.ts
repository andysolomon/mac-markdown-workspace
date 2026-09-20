import { scrypt } from "@noble/hashes/scrypt.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/**
 * Vault crypto (issue #19 / W-000019, docs/passwordless-vault-sync.md).
 *
 * Two secrets, two jobs:
 * - Vault ID: public address of the vault (safe to display as a "Sync code").
 * - Passphrase: never persisted, never transmitted. Client-side it derives
 *   (scrypt -> HKDF) an AES-256-GCM encryption key and a write token; a
 *   server stores only SHA-256(writeToken).
 *
 * AES-GCM itself runs on WebCrypto (native, audited); key derivation uses
 * @noble/hashes (small, auditable, no WASM).
 *
 * Threat model note: anyone holding the vault id + ciphertext (server
 * operator, S3 leak) can mount an OFFLINE brute-force on the passphrase —
 * the KDF cost is the only throttle. N=2^17/r=8 (~128MB memory-hard) is the
 * OWASP-recommended scrypt tier; the vault-id salt only stops cross-vault
 * rainbow tables, not a targeted attack, so passphrase strength still
 * matters (enforced at createVault / in the UI). Params are baked into every
 * vault's derivation — changing them is a new envelope version, never an
 * in-place edit.
 */

const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, dkLen: 32 };
const NONCE_BYTES = 12; // 96-bit GCM nonce, random per encryption

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface VaultKeys {
  /** Raw 32-byte AES-256-GCM key material. */
  encryptionKey: Uint8Array;
  /** Hex bearer token proving write access; server stores only its hash. */
  writeToken: string;
  /** Hex SHA-256 of the write token — the only secret a server ever holds. */
  writeTokenHash: string;
}

export function generateVaultId(): string {
  return `vlt_${crypto.randomUUID()}`;
}

/** Derive the vault key set from the passphrase. Deterministic per
    (passphrase, vaultId) so any device can re-derive; the vault id salts the
    derivation so equal passphrases on different vaults yield different keys.
    Costs ~0.5–2s by design — callers doing repeated syncs should hold the
    derived keys for the session rather than re-deriving per call.
    (writeToken is a JS string and cannot be zeroed; encryptionKey can — the
    caller owns that via .fill(0) when done.) */
export function deriveVaultKeys(passphrase: string, vaultId: string): VaultKeys {
  const master = scrypt(
    textEncoder.encode(passphrase.normalize("NFKC")),
    textEncoder.encode(`mmw-vault:${vaultId}`),
    SCRYPT_PARAMS,
  );
  const encryptionKey = hkdf(sha256, master, undefined, textEncoder.encode("mmw-enc-v1"), 32);
  const writeTokenBytes = hkdf(sha256, master, undefined, textEncoder.encode("mmw-write-v1"), 32);
  const writeToken = bytesToHex(writeTokenBytes);
  const writeTokenHash = bytesToHex(sha256(textEncoder.encode(writeToken)));
  master.fill(0);
  writeTokenBytes.fill(0);
  return { encryptionKey, writeToken, writeTokenHash };
}

/** Encrypted envelope: version + base64(nonce) + base64(ciphertext||tag).
    The GCM AAD binds ciphertext to `mmw-v1:<vaultId>`, so an envelope cannot
    be replayed into another vault or reinterpreted under a future version. */
export interface VaultEnvelope {
  v: 1;
  nonce: string;
  ct: string;
}

function aad(vaultId: string): Uint8Array {
  return textEncoder.encode(`mmw-v1:${vaultId}`);
}

/** Either raw derived bytes (fresh from deriveVaultKeys) or an already
    imported — possibly non-extractable — AES-GCM key. Resident keys
    (docs/ambient-vault-sync.md, Part 1) are the latter: on web the bytes can
    never be read back out, so every consumer must accept the handle form. */
export type AesKeyInput = Uint8Array | CryptoKey;

/** Import raw key material once and hold the handle for the session (or
    persist it — see vaultKeyStore). Non-extractable by default so the bytes
    cannot be exported again by script. */
export async function importEncryptionKey(
  raw: Uint8Array,
  extractable = false,
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, extractable, [
    "encrypt",
    "decrypt",
  ]);
}

async function importAesKey(key: AesKeyInput, usage: KeyUsage): Promise<CryptoKey> {
  // Duck-typed on purpose: `CryptoKey` isn't a guaranteed global everywhere
  // WebCrypto is (test runners included); anything that isn't raw bytes is
  // an already-imported handle.
  if (!(key instanceof Uint8Array)) return key;
  return crypto.subtle.importKey("raw", key as BufferSource, { name: "AES-GCM" }, false, [usage]);
}

export async function encryptSnapshot(
  encryptionKey: AesKeyInput,
  vaultId: string,
  plaintext: string,
): Promise<VaultEnvelope> {
  const key = await importAesKey(encryptionKey, "encrypt");
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad(vaultId) as BufferSource },
    key,
    textEncoder.encode(plaintext),
  );
  return { v: 1, nonce: toBase64(nonce), ct: toBase64(new Uint8Array(ct)) };
}

/** Throws (WebCrypto OperationError) on wrong key, tampered ciphertext, or a
    mismatched vault id (AAD). */
export async function decryptSnapshot(
  encryptionKey: AesKeyInput,
  vaultId: string,
  envelope: VaultEnvelope,
): Promise<string> {
  if (envelope.v !== 1) throw new Error(`Unsupported vault envelope version: ${envelope.v}`);
  const key = await importAesKey(encryptionKey, "decrypt");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(envelope.nonce) as BufferSource,
      additionalData: aad(vaultId) as BufferSource,
    },
    key,
    fromBase64(envelope.ct) as BufferSource,
  );
  return textDecoder.decode(plaintext);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
