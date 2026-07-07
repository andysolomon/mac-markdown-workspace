---
title: Crypto & sync engine
description: Key derivation, the AES-GCM envelope, and last-write-wins merge with two-sided tombstones.
---

The client crypto and merge logic live above the platform shims, in
`vaultCrypto.ts` and `vaultSync.ts`. Both are pure and injectable — the transport
and the local notes store are passed in as ports — so the whole engine is unit
tested without a network or a real filesystem.

## Key derivation

```text
passphrase ──(NFKC normalize)──┐
vaultId ─────(salt)────────────┤
                               ▼
                 scrypt  N=2¹⁷, r=8, p=1     (~128 MB, memory-hard)
                               │
                               ▼
                 HKDF (domain separation)
                     ├── encryptionKey   (AES-256-GCM)
                     └── writeToken       → SHA-256 stored server-side
```

scrypt at `N=2¹⁷` was chosen over Argon2id for comparable memory-hardness with
zero WebAssembly — it ships in `@noble/hashes`. The parameters are baked into every
vault's derivation; changing them means a new envelope version.

## The envelope

Each snapshot is sealed with AES-256-GCM using a fresh 96-bit nonce and the vault
id bound as **additional authenticated data**:

```ts
const aad = (id) => new TextEncoder().encode(`mmw-v1:${id}`);
// encrypt: { v: 1, nonce, ct }  — exactly these three fields
```

Binding the AAD is what prevents a valid snapshot from one vault being spliced
into another: decryption fails the authentication tag if the id doesn't match.

## Merge — last-write-wins with two-sided tombstones

A naïve LWW loses deletions: a note deleted on device A reappears from the vault on
the next sync. The fix is a **tombstone** recorded at the single delete chokepoint
(`notesStore.deleteNote`) and carried through the platform port:

1. Decrypt the remote snapshot → `remoteNotes` + remote `deletedIds`.
2. Read local notes and local tombstones.
3. Per id, keep the higher `updatedAt`; union the deletions from both sides.
4. **An edit newer than a deletion resurrects the note** — in either direction.
5. Write the merged set locally (preserving each note's `updatedAt` *verbatim* —
   re-stamping pulled notes with "now" corrupts LWW across three or more devices),
   then re-encrypt and upload if anything changed.
6. Clear tombstones only after a confirmed push.

## Optimistic concurrency

`getSnapshot()` returns an opaque ETag; `putSnapshot()` takes an `ifMatch` and
throws `VaultConflictError` on a precondition failure (HTTP 412). `syncVault`
catches it, re-pulls, re-merges, and retries up to three times. Clients also
refuse any snapshot with `version > 1` rather than mis-merging a future schema.

## What the tests prove

The engine ships with unit tests for encrypt/decrypt round-trips, delete
propagation, `updatedAt` preservation, **three-device convergence**, concurrent-push
conflict-and-retry, and tamper/AAD rejection. An adversarial security review round
caught two HIGH bugs before anything shipped — local deletes resurrecting, and
pulled notes being re-stamped — both fixed by tightening the port contract.
