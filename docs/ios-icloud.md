# iOS storage & iCloud (W-000005 / issue #5 · W-000008 / issue #8)

## Where notes live on iOS

The notes library is written with `@capacitor/filesystem`. Settings → **Storage**
(shown only in the native Capacitor runtime) offers two genuinely distinct
locations inside the app sandbox:

| Setting (canonical value) | Capacitor directory | Physical path | Backed up | Files app |
|---|---|---|---|---|
| **Documents & Backup** (`documents`, default) | `Directory.Documents` | `Documents/notes/{id}.md` | Yes — device backup (iCloud Backup / Finder) | Visible once the plist keys below are set |
| **On device** (`private`) | `Directory.LibraryNoCloud` | `Library/NoCloud/notes/{id}.md` | No — excluded from cloud backup | Never |

The sync sidecar `notes/.vault-meta.json` (canonical `updatedAt` times and
deletion tombstones for Cloud Sync) always lives beside the notes in the active
root and moves with them.

`Directory.Data` is intentionally **not** used for notes or metadata: Capacitor
Filesystem 8 maps `Directory.Data` and `Directory.Documents` to the same iOS
Documents directory, which is why the first version of this setting ("iCloud"
vs "On device", commit `237013b`) did not actually separate the two choices.

Generic file operations that are not the notes library — Open/Save-As of a
loose `.md`, exports — keep using `Directory.Documents` (or the cache for
share sheets) regardless of this setting.

> **Neither option is iCloud Drive sync.** Cross-device sync is the encrypted
> **Cloud Sync** feature (`docs/passwordless-vault-sync.md`). A true iCloud
> ubiquity-container bridge remains deferred (see below).

## Switching locations (migration)

Changing the setting moves the whole library. The iOS shim
(`src/ios/capacitorApi.ts` → `src/ios/notesStorage.ts`) runs the switch as a
serialized transaction; every notes read/write, scaffold, and Cloud Sync write
queues behind it, so a pending autosave or a sync pull can never interleave
with a half-moved library:

1. **Snapshot** the current (source) root: every note id, body, the metadata
   `times`, and `tombstones`. Missing `times` entries are filled from each
   source file's mtime before it can be changed by copying. Corrupt metadata
   fails the switch here instead of being silently read as empty.
2. **Reconcile** the inactive (target) root to exactly that snapshot: overwrite
   matching ids, write missing ones, delete target-only stale files, write the
   metadata sidecar.
3. **Verify** by reading the target back: note count, ids, bodies, and metadata
   must match.
4. **Activate**: only now are the canonical preference and a cleanup marker
   (`iosStorageMigration`, phase `cleanup`) persisted atomically in one
   `mmw-settings` localStorage write.
5. **Clean up** the source copy last, then clear the marker.

Failure semantics:

- Any failure before step 4 rejects the switch. The old location stays active
  and untouched; the Settings pill keeps the previous selection and shows the
  error. Retrying converges (the partial target copy is reconciled).
- A failure during step 5 still resolves the switch successfully on the target.
  Reads are **active-root-only**, so leftovers in the old root cannot
  resurface; the retained marker makes the next launch retry the cleanup.
- If the app is killed mid-copy (marker phase `copy`), the next launch discards
  the marker and keeps the source authoritative (an unfinished legacy
  `"device"` upgrade is simply retried).
- A cleanup marker only deletes its source when the persisted preference
  already names its target. If the two disagree, the persisted preference's
  root is treated as authoritative, the marker is discarded, and nothing is
  deleted.

The Settings control flushes the active note's pending edit before starting,
waits for the shim, updates the visible selection only on success, and reloads
the library from the new root afterwards (ids are preserved, so the open note
stays open).

## Upgrading from the earlier build

The pre-W-000008 build persisted `"icloud"` / `"device"`. On first launch of
this build the shim normalizes them and only ever reports canonical values:

| Persisted before | Result | Why |
|---|---|---|
| `"icloud"` | `documents` (no data moved) | Old default; data was in Documents |
| `"device"` | migrate Documents → LibraryNoCloud, then `private` | The old code wrote "device" notes to `Directory.Data`, i.e. Documents. A pre-activation failure falls back to `documents`; after activation, cleanup is best-effort and the app stays private so new writes never return to a partially deleted source. |
| unset / unknown | `documents` | Default |

## Making the library visible in Files / iCloud Drive

These steps require Xcode on the generated project (`ios/App/App.xcworkspace`)
and cannot be automated from this repository:

1. **Expose the Documents folder in the Files app** — in `ios/App/App/Info.plist`
   add:

   ```xml
   <key>UIFileSharingEnabled</key>
   <true/>
   <key>LSSupportsOpeningDocumentsInPlace</key>
   <true/>
   ```

   After this, the `notes/` folder is browsable under *On My iPhone/iPad →
   Mac Markdown* while **Documents & Backup** is selected, and note files can
   be opened in place by other apps. The **On device** location is never
   exposed to Files.

2. **True iCloud Drive syncing (optional, entitlement required, DEFERRED)** — in Xcode:
   - Target **App** → *Signing & Capabilities* → **+ Capability** → **iCloud**.
   - Check **iCloud Documents** and create/select a container, e.g.
     `iCloud.com.andrewsolomon.macmarkdownworkspace`.
   - Add to `Info.plist`:

     ```xml
     <key>NSUbiquitousContainers</key>
     <dict>
       <key>iCloud.com.andrewsolomon.macmarkdownworkspace</key>
       <dict>
         <key>NSUbiquitousContainerIsDocumentScopePublic</key>
         <true/>
         <key>NSUbiquitousContainerName</key>
         <string>Mac Markdown</string>
       </dict>
     </dict>
     ```

   - Writing into the ubiquity container (rather than the sandbox Documents
     directory) needs a small native bridge or a Capacitor plugin that exposes
     the container URL. The JS shim does not do this; the encrypted Cloud Sync
     vault is the supported cross-device path, so this track is intentionally
     deferred (see `docs/passwordless-vault-sync.md`, Phase E).

3. Rebuild: `bun run ios:sync && bun run ios:open`, then run on a device
   signed with a provisioning profile that includes the iCloud entitlement.

## Verifying on a simulator or device

Automated coverage lives in `src/tests/iosNotesStorage.test.ts` (stateful
Filesystem mock: routing, legacy upgrades, both migration directions,
complete fallback-time/tombstone preservation, atomic activation,
failure/retry/interruption, serialization)
and `src/tests/SettingsPanel.test.tsx` (native-only rendering, transactional
UI). To confirm the physical roots on a real runtime:

```bash
bun run ios:sync && bun run ios:open      # build + open Xcode, run on a simulator
xcrun simctl get_app_container booted <bundle-id> data
# then inspect:
#   <container>/Documents/notes/          (Documents & Backup)
#   <container>/Library/NoCloud/notes/    (On device)
```

Expected: the active library appears in the folder matching the setting;
switching activates it there and normally empties the other. If source cleanup
is interrupted, the old folder may temporarily retain a stale partial copy and
is retried on relaunch. The choice survives terminate + relaunch; a legacy
`"device"` value in `mmw-settings` (localStorage) is migrated on first launch.
