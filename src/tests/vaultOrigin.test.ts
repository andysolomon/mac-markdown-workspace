import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PROD_ORIGIN,
  resolveVaultBaseUrl,
} from "../services/vaultHttpTransport";

const mainSource = readFileSync(path.resolve(process.cwd(), "src/main.ts"), "utf8");

describe("vault API origin selection", () => {
  it("uses the allowlisted production origin for packaged Electron", () => {
    expect(resolveVaultBaseUrl({ protocol: "file:", userAgent: "Mozilla" })).toBe(PROD_ORIGIN);
  });

  it("uses the allowlisted production origin for Electron development", () => {
    expect(
      resolveVaultBaseUrl({ protocol: "http:", userAgent: "Mozilla/5.0 Electron/41.0.2" }),
    ).toBe(PROD_ORIGIN);
  });

  it("uses the allowlisted production origin for Capacitor", () => {
    expect(resolveVaultBaseUrl({ protocol: "capacitor:", capacitor: true })).toBe(PROD_ORIGIN);
  });

  it("keeps deployed web same-origin", () => {
    expect(resolveVaultBaseUrl({ protocol: "https:", userAgent: "Mozilla/5.0" })).toBe("");
  });

  it("allows only the production origin in the Electron CSP", () => {
    expect(mainSource).toContain(`connect-src 'self' ${PROD_ORIGIN}`);
    expect(mainSource).not.toContain("connect-src *");
  });
});
