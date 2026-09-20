import { describe, it, expect } from "vitest";
import {
  PAIRING_ALPHABET,
  encodePairingCode,
  formatPairingCode,
  isCanonicalPairingCode,
  normalizePairingCode,
} from "../../shared/pairingCode";

describe("pairing code codec", () => {
  it("uses a Crockford alphabet with no I, L, O, or U", () => {
    expect(PAIRING_ALPHABET).toHaveLength(32);
    for (const c of "ILOU") expect(PAIRING_ALPHABET).not.toContain(c);
  });

  it("encodes eight random bytes as eight alphabet symbols", () => {
    const code = encodePairingCode(new Uint8Array([0, 1, 31, 32, 33, 255, 10, 200]));
    expect(code).toHaveLength(8);
    expect(isCanonicalPairingCode(code)).toBe(true);
    expect(code[0]).toBe("0");
    expect(code[2]).toBe("Z"); // 31 -> last symbol
    expect(code[3]).toBe("0"); // 32 & 0x1f -> 0
    expect(() => encodePairingCode(new Uint8Array(7))).toThrow();
  });

  it("normalizes what people actually type", () => {
    expect(normalizePairingCode("k7f2-m9qx")).toBe("K7F2M9QX");
    expect(normalizePairingCode("  K7F2 M9QX ")).toBe("K7F2M9QX");
    // Ambiguous glyphs fold onto the digits they resemble.
    expect(normalizePairingCode("i1lo-0OL1")).toBe("11100011");
    expect(normalizePairingCode("K7F2M9Q")).toBeNull(); // too short
    expect(normalizePairingCode("K7F2M9QXX")).toBeNull(); // too long
    expect(normalizePairingCode("K7F2M9Q!")).toBeNull();
    expect(normalizePairingCode("K7F2M9QU")).toBeNull(); // U is not in the alphabet
  });

  it("formats for display as XXXX-XXXX", () => {
    expect(formatPairingCode("K7F2M9QX")).toBe("K7F2-M9QX");
  });
});
