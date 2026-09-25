import { describe, expect, it } from "vitest";
import {
  PROD_ORIGIN,
  resolveVaultBaseUrl,
} from "../services/vaultHttpTransport";

describe("vault API origin selection", () => {
  it("uses the allowlisted production origin for Capacitor", () => {
    expect(resolveVaultBaseUrl({ protocol: "capacitor:", capacitor: true })).toBe(PROD_ORIGIN);
  });

  it("keeps deployed web same-origin", () => {
    expect(resolveVaultBaseUrl({ protocol: "https:", userAgent: "Mozilla/5.0" })).toBe("");
  });
});
