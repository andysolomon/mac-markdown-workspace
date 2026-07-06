import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCors,
  createVaultStore,
  isValidTokenHash,
  isValidVaultId,
  sendError,
} from "../_lib/vaultStore";

/** POST /api/vault — register a vault: client-generated id + the SHA-256 of
    its write token. The server never sees the passphrase or the token. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { vaultId, writeTokenHash } = (req.body ?? {}) as {
    vaultId?: unknown;
    writeTokenHash?: unknown;
  };
  if (!isValidVaultId(vaultId) || !isValidTokenHash(writeTokenHash)) {
    res.status(400).json({ error: "Expected { vaultId: vlt_<uuid>, writeTokenHash: <sha256 hex> }" });
    return;
  }
  try {
    await createVaultStore().createVault(vaultId, writeTokenHash);
    res.status(201).json({ vaultId });
  } catch (error) {
    sendError(res, error);
  }
}
