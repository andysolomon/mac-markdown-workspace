/**
 * Pairing-code codec (docs/ambient-vault-sync.md, Part 2). Shared by the
 * Vercel API (mints codes) and the client (normalizes what the user typed).
 *
 * Crockford base32: no I, L, O, U, so `0`/`O` and `1`/`I`/`l` can never be
 * mistyped, and nothing reads as a word. Eight symbols = 40 bits, displayed
 * as `K7F2-M9QX`; input is case-insensitive and the hyphen is optional.
 */

export const PAIRING_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 8;
/** Codes are short-lived capability tokens: ten minutes, then gone. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;

const CANONICAL_PATTERN = new RegExp(`^[${PAIRING_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`);

/** Encode `bytes` (must be exactly PAIRING_CODE_LENGTH long) as a code: one
    alphabet symbol per byte, taking the low five bits of each. Callers pass
    fresh CSPRNG bytes, so the three discarded bits per byte cost nothing. */
export function encodePairingCode(bytes: Uint8Array): string {
  if (bytes.length !== PAIRING_CODE_LENGTH) {
    throw new Error(`Pairing code needs ${PAIRING_CODE_LENGTH} random bytes`);
  }
  let out = "";
  for (const b of bytes) out += PAIRING_ALPHABET[b & 0x1f];
  return out;
}

/** Canonical form of user input: uppercase, hyphens/whitespace stripped, and
    the visually ambiguous letters folded onto the digits they resemble.
    Returns null when the result isn't a well-formed code. */
export function normalizePairingCode(input: string): string | null {
  const folded = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  return CANONICAL_PATTERN.test(folded) ? folded : null;
}

export function isCanonicalPairingCode(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_PATTERN.test(value);
}

/** `K7F2M9QX` → `K7F2-M9QX` for display. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
