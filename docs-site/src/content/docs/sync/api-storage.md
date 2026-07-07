---
title: API & storage
description: Vercel serverless routes over a private S3 bucket, with conditional writes, a token-hash check, and hardening against XSS and abuse.
---

The backend is a handful of Vercel Node functions in `api/vault/` over a private
S3 bucket. It is deliberately thin: it enforces *write* authorization and
*integrity*, and never touches keys or plaintext.

## Routes

| Route                             | Behavior                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| `POST /api/vault`                 | Register a client-generated `vlt_<uuid>`; store `writeTokenHash`; 409 on reuse |
| `GET /api/vault/:id/meta`         | Return advisory `meta.json`                                              |
| `GET /api/vault/:id/snapshot`     | Stream `snapshot.enc` with its S3 ETag                                    |
| `PUT /api/vault/:id/snapshot`     | Bearer-token gated; conditional write; store ciphertext                   |

The vault id is **client-generated** (so the id can salt key derivation before the
server ever hears about it); `POST` therefore *registers* rather than mints, using
an S3 `If-None-Match: *` on the auth object to reject re-registration.

## Optimistic concurrency, end to end

The snapshot's S3 ETag rides the response header. Clients send it back as a
conditional header on the next write, which maps onto an S3 conditional PUT → HTTP
412 → `VaultConflictError` → client re-merge and retry. `meta.json` is
**advisory-only**: the snapshot's conditional PUT is the atomic source of truth, so
"is remote newer?" is derived from the snapshot ETag, never `meta.updatedAt`.

:::note[Vercel edge detail]
Vercel's edge consumes the standard `If-Match` / `If-None-Match` headers before the
function sees them, so concurrency rides custom `X-Vault-If-Match` /
`X-Vault-If-None-Match` headers instead. The SPA rewrite also had to be narrowed to
exclude `/api` — dynamic-segment functions resolve *after* user rewrites.
:::

## Hardening (two adversarial review passes)

- **Stored-XSS on `GET /snapshot` (HIGH, fixed).** `@vercel/node`'s `res.send(string)`
  defaults to `Content-Type: text/html`; a crafted ciphertext served from our own
  origin could execute script against the web app. Fixed with an explicit
  `application/json` + `X-Content-Type-Options: nosniff`, and a strict envelope
  validator that requires exactly `{ v, nonce, ct }` with base64-shaped,
  length-bounded fields — rejecting markup and unknown keys before anything is
  stored.
- **Unauthenticated create abuse (MEDIUM, mitigated).** `POST /api/vault` is
  login-free by design, so a Vercel Firewall rule caps it at 5 creations/min/IP,
  denied at the edge before any S3 write. Read paths stay open behind 122-bit
  unguessable ids.
- **Constant-time token check.** The presented bearer token is SHA-256'd and
  compared in constant time; a malformed stored hash is rejected explicitly rather
  than silently truncated.

## Infrastructure

A private S3 bucket (public access blocked, SSE-S3) and a least-privilege IAM user
scoped to `Get/Put/List` under the `mmw-sync/` prefix only. Credentials live in
Vercel **production** env vars named `VAULT_S3_*` (the `AWS_*` names are reserved by
the Vercel runtime), with the secret marked write-only. Snapshot bodies over 4 MB
are rejected, under Vercel's own 4.5 MB ceiling.
