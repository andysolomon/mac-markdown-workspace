import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, createVaultStore, isValidVaultId, sendError } from "../../_lib/vaultStore";

/** GET /api/vault/:id/meta — public freshness probe ({updatedAt, size,
    schemaVersion}); knowing a vault id only ever yields metadata about
    ciphertext. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const vaultId = req.query.id;
  if (!isValidVaultId(vaultId)) {
    res.status(400).json({ error: "Invalid vault id" });
    return;
  }
  try {
    const meta = await createVaultStore().getMeta(vaultId);
    if (!meta) {
      res.status(404).json({ error: "Vault not found" });
      return;
    }
    res.status(200).json(meta);
  } catch (error) {
    sendError(res, error);
  }
}
