import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  MAX_SNAPSHOT_BYTES,
  applyCors,
  createVaultStore,
  isValidEnvelope,
  isValidVaultId,
  sendError,
} from "../../_lib/vaultStore";

/**
 * GET /api/vault/:id/snapshot — return the encrypted envelope; the S3 ETag
 * rides along in the ETag header as the optimistic-concurrency version tag.
 *
 * PUT /api/vault/:id/snapshot — requires `Authorization: Bearer <writeToken>`.
 * `X-Vault-If-Match: <etag>` / `X-Vault-If-None-Match: *` map onto S3
 * conditional writes, so a concurrent device's push surfaces as 412 (client
 * re-merges and retries). Custom header names because Vercel's edge proxy
 * consumes the standard If-Match/If-None-Match itself (it 304'd a PUT and
 * stripped the condition before the function ran).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res)) return;
  const vaultId = req.query.id;
  if (!isValidVaultId(vaultId)) {
    res.status(400).json({ error: "Invalid vault id" });
    return;
  }
  const store = createVaultStore();

  try {
    if (req.method === "GET") {
      const snapshot = await store.getSnapshot(vaultId);
      if (!snapshot) {
        res.status(404).json({ error: "No snapshot" });
        return;
      }
      if (snapshot.etag) res.setHeader("ETag", snapshot.etag);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(snapshot.envelope);
      return;
    }

    if (req.method === "PUT") {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing write token" });
        return;
      }
      const envelope = req.body as unknown;
      if (!isValidEnvelope(envelope)) {
        res.status(400).json({ error: "Body must be a v1 vault envelope" });
        return;
      }
      const envelopeJson = JSON.stringify(envelope);
      if (Buffer.byteLength(envelopeJson, "utf8") > MAX_SNAPSHOT_BYTES) {
        res.status(413).json({ error: "Snapshot too large" });
        return;
      }
      const ifMatch = req.headers["x-vault-if-match"];
      const ifNoneMatch = req.headers["x-vault-if-none-match"];
      const conditions =
        ifNoneMatch === "*"
          ? { ifMatch: null }
          : typeof ifMatch === "string"
            ? { ifMatch }
            : undefined;
      const { etag } = await store.putSnapshot(
        vaultId,
        auth.slice("Bearer ".length),
        envelopeJson,
        conditions,
      );
      if (etag) res.setHeader("ETag", etag);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    sendError(res, error);
  }
}
