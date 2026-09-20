import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, createVaultStore, isValidVaultId, sendError } from "../../_lib/vaultStore";

/** POST /api/vault/pair — mint a short-lived pairing code for a vault
    (docs/ambient-vault-sync.md, Part 2). Requires `Authorization: Bearer
    <writeToken>`: only a device that already holds the passphrase-derived
    keys can hand out its vault's address. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing write token" });
    return;
  }
  const { vaultId } = (req.body ?? {}) as { vaultId?: unknown };
  if (!isValidVaultId(vaultId)) {
    res.status(400).json({ error: "Expected { vaultId: vlt_<uuid> }" });
    return;
  }
  try {
    const pairing = await createVaultStore().createPairing(vaultId, auth.slice("Bearer ".length));
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(pairing);
  } catch (error) {
    sendError(res, error);
  }
}
