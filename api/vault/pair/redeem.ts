import type { VercelRequest, VercelResponse } from "@vercel/node";
import { normalizePairingCode } from "../../../shared/pairingCode";
import { applyCors, createVaultStore, sendError } from "../../_lib/vaultStore";

/** POST /api/vault/pair/redeem — burn a pairing code and return the vault id
    it named. Unauthenticated by design: the code IS the capability, and what
    it yields is only an address for ciphertext. Unknown, expired, and
    already-used codes are indistinguishable (404) so the endpoint leaks
    nothing about which codes were ever live. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { code } = (req.body ?? {}) as { code?: unknown };
  const canonical = typeof code === "string" ? normalizePairingCode(code) : null;
  if (!canonical) {
    res.status(400).json({ error: "Expected { code: <8-character pairing code> }" });
    return;
  }
  try {
    const result = await createVaultStore().redeemPairing(canonical);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
}
