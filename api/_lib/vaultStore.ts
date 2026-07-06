import { createHash, timingSafeEqual } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Vault sync backend store (issue #20 / W-000020,
 * docs/passwordless-vault-sync.md Phase B).
 *
 * S3 layout under VAULT_S3_PREFIX:
 *   vaults/{vaultId}/auth.json     { writeTokenHash }        server-only
 *   vaults/{vaultId}/meta.json     { updatedAt, size, schemaVersion } public
 *   vaults/{vaultId}/snapshot.enc  VaultEnvelope JSON        public (ciphertext)
 *
 * The server never sees plaintext or the write token's preimage-at-rest:
 * clients send `Authorization: Bearer <writeToken>` and we compare
 * SHA-256(writeToken) against auth.json in constant time.
 *
 * Env (VAULT_* because Vercel reserves the AWS_* names on its runtime):
 * VAULT_S3_BUCKET, VAULT_S3_REGION, VAULT_S3_ACCESS_KEY_ID,
 * VAULT_S3_SECRET_ACCESS_KEY, VAULT_S3_PREFIX (default "mmw-sync").
 */

export const VAULT_ID_PATTERN = /^vlt_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
/** Vercel's request-body ceiling is 4.5MB; stay under it with headroom. */
export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

export function isValidVaultId(id: unknown): id is string {
  return typeof id === "string" && VAULT_ID_PATTERN.test(id);
}

export function isValidTokenHash(hash: unknown): hash is string {
  return typeof hash === "string" && TOKEN_HASH_PATTERN.test(hash);
}

/** Constant-time check of a presented bearer token against the stored hash. */
export function writeTokenMatches(presentedToken: string, storedHashHex: string): boolean {
  const presented = createHash("sha256").update(presentedToken, "utf8").digest();
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHashHex, "hex");
  } catch {
    return false;
  }
  if (stored.length !== presented.length) return false;
  return timingSafeEqual(presented, stored);
}

export interface EnvelopeShape {
  v: 1;
  nonce: string;
  ct: string;
}

export function isValidEnvelope(body: unknown): body is EnvelopeShape {
  if (typeof body !== "object" || body === null) return false;
  const e = body as Record<string, unknown>;
  return e.v === 1 && typeof e.nonce === "string" && typeof e.ct === "string";
}

export interface VaultMetaRecord {
  updatedAt: number;
  size: number;
  schemaVersion: number;
}

interface VaultEnv {
  bucket: string;
  prefix: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function readEnv(): VaultEnv {
  const {
    VAULT_S3_BUCKET: bucket,
    VAULT_S3_REGION: region,
    VAULT_S3_ACCESS_KEY_ID: accessKeyId,
    VAULT_S3_SECRET_ACCESS_KEY: secretAccessKey,
  } = process.env;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("Vault sync is not configured (missing VAULT_S3_* env vars)");
  }
  return { bucket, region, accessKeyId, secretAccessKey, prefix: process.env.VAULT_S3_PREFIX || "mmw-sync" };
}

let cachedClient: S3Client | null = null;
function s3(env: VaultEnv): S3Client {
  cachedClient ??= new S3Client({
    region: env.region,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
  });
  return cachedClient;
}

function key(env: VaultEnv, vaultId: string, name: string): string {
  return `${env.prefix}/vaults/${vaultId}/${name}`;
}

interface S3ErrorLike {
  name?: string;
  $metadata?: { httpStatusCode?: number };
}

function statusOf(error: unknown): number | undefined {
  return (error as S3ErrorLike)?.$metadata?.httpStatusCode;
}

function isNotFound(error: unknown): boolean {
  const name = (error as S3ErrorLike)?.name;
  return name === "NoSuchKey" || name === "NotFound" || statusOf(error) === 404;
}

function isPreconditionFailure(error: unknown): boolean {
  const name = (error as S3ErrorLike)?.name;
  return (
    name === "PreconditionFailed" ||
    name === "ConditionalRequestConflict" ||
    statusOf(error) === 412 ||
    statusOf(error) === 409
  );
}

export class VaultStoreError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "VaultStoreError";
  }
}

async function getObject(
  env: VaultEnv,
  objectKey: string,
): Promise<{ body: string; etag: string | null } | null> {
  try {
    const result = await s3(env).send(
      new GetObjectCommand({ Bucket: env.bucket, Key: objectKey }),
    );
    const body = await result.Body?.transformToString("utf8");
    return { body: body ?? "", etag: result.ETag ?? null };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function putObject(
  env: VaultEnv,
  objectKey: string,
  body: string,
  conditions?: { ifMatch?: string | null },
): Promise<string | null> {
  const input: PutObjectCommandInput = {
    Bucket: env.bucket,
    Key: objectKey,
    Body: body,
    ContentType: "application/json",
  };
  if (conditions && conditions.ifMatch !== undefined) {
    if (conditions.ifMatch === null) input.IfNoneMatch = "*";
    else input.IfMatch = conditions.ifMatch;
  }
  try {
    const result = await s3(env).send(new PutObjectCommand(input));
    return result.ETag ?? null;
  } catch (error) {
    if (isPreconditionFailure(error)) {
      throw new VaultStoreError(412, "Snapshot changed since last pull");
    }
    throw error;
  }
}

export interface VaultStore {
  createVault(vaultId: string, writeTokenHash: string): Promise<void>;
  getMeta(vaultId: string): Promise<VaultMetaRecord | null>;
  getSnapshot(vaultId: string): Promise<{ envelope: string; etag: string | null } | null>;
  putSnapshot(
    vaultId: string,
    writeToken: string,
    envelopeJson: string,
    conditions?: { ifMatch?: string | null },
  ): Promise<{ etag: string | null }>;
}

export function createVaultStore(): VaultStore {
  const env = readEnv();
  return {
    async createVault(vaultId, writeTokenHash) {
      try {
        await putObject(env, key(env, vaultId, "auth.json"), JSON.stringify({ writeTokenHash }), {
          ifMatch: null, // refuse to overwrite an existing vault's auth record
        });
      } catch (error) {
        if (error instanceof VaultStoreError && error.status === 412) {
          throw new VaultStoreError(409, "Vault already exists");
        }
        throw error;
      }
      const meta: VaultMetaRecord = { updatedAt: 0, size: 0, schemaVersion: 1 };
      await putObject(env, key(env, vaultId, "meta.json"), JSON.stringify(meta));
    },

    async getMeta(vaultId) {
      const result = await getObject(env, key(env, vaultId, "meta.json"));
      return result ? (JSON.parse(result.body) as VaultMetaRecord) : null;
    },

    async getSnapshot(vaultId) {
      const result = await getObject(env, key(env, vaultId, "snapshot.enc"));
      return result ? { envelope: result.body, etag: result.etag } : null;
    },

    async putSnapshot(vaultId, writeToken, envelopeJson, conditions) {
      const auth = await getObject(env, key(env, vaultId, "auth.json"));
      if (!auth) throw new VaultStoreError(404, "Vault not found");
      const { writeTokenHash } = JSON.parse(auth.body) as { writeTokenHash?: string };
      if (!writeTokenHash || !writeTokenMatches(writeToken, writeTokenHash)) {
        throw new VaultStoreError(403, "Invalid write token");
      }
      const etag = await putObject(env, key(env, vaultId, "snapshot.enc"), envelopeJson, conditions);
      const meta: VaultMetaRecord = {
        updatedAt: Date.now(),
        size: Buffer.byteLength(envelopeJson, "utf8"),
        schemaVersion: 1,
      };
      await putObject(env, key(env, vaultId, "meta.json"), JSON.stringify(meta));
      return { etag };
    },
  };
}

/** Shared per-request plumbing: permissive CORS (the iOS app calls from a
    capacitor:// origin; content is ciphertext and writes are token-gated),
    OPTIONS preflight, and uniform error mapping. Returns true when the
    request was fully handled. */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, If-Match, If-None-Match");
  res.setHeader("Access-Control-Expose-Headers", "ETag");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export function sendError(res: VercelResponse, error: unknown): void {
  if (error instanceof VaultStoreError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error("vault api error:", error instanceof Error ? error.message : error);
  res.status(500).json({ error: "Internal error" });
}
