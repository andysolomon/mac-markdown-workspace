# W-000008 — iOS storage-location choice

**Source:** GitHub issue #8 — “[W-000008] iOS save-location option: iCloud vs on-device”  
**Branch:** `feat/W-000008-ios-storage-location`  
**Planning decision:** Finish a genuine local storage choice. Cross-device sync remains the encrypted Cloud Sync feature; true iCloud Drive ubiquity remains deferred.

## 1. Product goal and scope boundaries

Let iOS users choose where the notes library is stored:

- **Documents & Backup:** the app sandbox’s `Documents/notes` directory, which may be included in device backup and can be Files-visible when the documented plist keys are enabled.
- **On device:** app-private `Library/NoCloud/notes`, represented by Capacitor’s `Directory.LibraryNoCloud`, and excluded from cloud backup.

The choice must appear only in native Capacitor, persist across relaunches, apply to all subsequent notes-library reads and writes, and safely move the existing library when changed.

This work does **not** implement an iCloud ubiquity-container bridge or Apple-device-to-Apple-device iCloud Drive synchronization. The app’s existing encrypted Cloud Sync remains the cross-device solution.

## 2. Current baseline

Issue #8 is partially implemented on `main` (introduced by commit `237013b`):

- `src/components/shell/SettingsPanel.tsx` conditionally renders a Storage section only when `Capacitor.isNativePlatform()` is true.
- `src/services/settingsStore.ts` stores an `iosStorage` preference; `src/components/App.tsx` restores it through `AppApi`.
- `src/ios/capacitorApi.ts` directs notes operations according to the persisted preference, merge-reads two roots, and deletes from both roots.
- `src/tests/appDefaults.test.ts` checks only the default preference.
- `docs/ios-icloud.md` and `docs/passwordless-vault-sync.md` already explain that true iCloud ubiquity sync is not implemented.

The implementation cannot yet satisfy the storage-control criterion: it maps “device” to `Directory.Data`, and Capacitor Filesystem 8 maps both `Directory.Data` and `Directory.Documents` to the iOS Documents directory. The two UI choices therefore use the same physical location. The current “iCloud” label is also stronger than the implementation: sandbox Documents may be backed up, but is not an iCloud Drive ubiquity container.

## 3. Missing capabilities

1. Two genuinely distinct native roots: `Directory.Documents` and `Directory.LibraryNoCloud`.
2. Backward-compatible normalization of persisted `"icloud" | "device"` values from the partial implementation.
3. Failure-safe, idempotent migration of notes and `.vault-meta.json` when the choice changes.
4. Serialization between migration and note CRUD/Cloud Sync writes.
5. Active-root-only reads after migration, so stale copies cannot reappear.
6. Awaited settings UX with busy, success, and rollback/error behavior.
7. Automated coverage for native-only visibility, persistence, directory routing, migration, metadata, and failures.
8. Simulator/device evidence that the roots are physically distinct and survive relaunch as intended.
9. Consistent, non-misleading product copy and documentation.

## 4. Milestones

### Milestone 1 — Define storage semantics and compatibility

**Goal:** Establish one canonical model for the setting and both physical roots.

**Deliverables**

- Update `src/services/settingsStore.ts` so the canonical preference is explicit, for example `"documents" | "private"`, with a default of `"documents"`.
- Add a focused iOS storage module, such as `src/ios/notesStorage.ts`, that owns:
  - canonical preference validation/normalization;
  - `documents -> Directory.Documents`;
  - `private -> Directory.LibraryNoCloud`;
  - legacy `icloud -> documents` normalization;
  - legacy `device -> private` upgrade migration, because old “device” data was physically written to Documents.
- Keep generic import/export/open/save-file operations in `src/ios/capacitorApi.ts` on Documents; only notes-library operations and scaffold materialization follow the notes storage preference.
- Do not use `Directory.Data` for notes or notes metadata on iOS.

**Dependencies:** Installed `@capacitor/filesystem` 8.1.2 exposes `Directory.LibraryNoCloud`.

**Risks:** A legacy `"device"` value cannot be treated as already migrated; the old implementation used Documents in practice.

**Acceptance criteria**

- A canonical setting unambiguously selects one of two distinct iOS directories.
- Existing installations normalize without hiding notes.

### Milestone 2 — Implement safe library migration and operation serialization

**Goal:** Move the complete active library without data loss and make interruption/retry deterministic.

**Deliverables**

- Refactor notes filesystem helpers out of `src/ios/capacitorApi.ts` into the storage module where useful; helpers must accept an explicit directory rather than reading mutable global state mid-operation.
- Make `getSetting("iosStorage")`, `setSetting("iosStorage", value)`, and every notes-library operation await one serialized storage-initialization/migration barrier.
- On startup, normalize legacy values before exposing the active root. A legacy `"device"` value must trigger Documents-to-LibraryNoCloud migration.
- On an explicit switch:
  1. Treat the currently selected root as authoritative.
  2. Read a complete source snapshot, including note IDs, bodies, logical timestamps, tombstones, and metadata.
  3. Reconcile the inactive target to exactly that snapshot: overwrite matching IDs, remove target-only stale note files, and write metadata explicitly to the target root.
  4. Read back and verify note count, IDs, bodies, and metadata before activation.
  5. Persist the new canonical preference and cleanup marker atomically in one settings-blob write only after verification succeeds.
  6. Remove source note data only after activation. Cleanup is best-effort: retain/retry the marker without rejecting the activated switch; active-root-only reads prevent stale source files from resurfacing.
- Preserve note IDs, bodies, `updatedAt` values, and `.vault-meta.json` `times`/`tombstones` through migration. Before copying, fill missing or partial `times` entries from source note mtimes.
- Make retry idempotent. Any failure before activation must leave the old preference and complete source library authoritative.
- Stop swallowing malformed metadata as an empty object during migration; distinguish “missing” from “corrupt” and fail closed to avoid losing timestamps or tombstones.
- After initialization, `listNotes` and `readNote` read only the active root. Keep defensive dual-root deletion/cleanup where needed to prevent stale copies from surviving an interrupted migration.

**Dependencies:** Milestone 1’s canonical mapping and legacy normalization.

**Risks:** Capacitor Filesystem provides no multi-file transaction. Copy/readback/activate/source-last cleanup and a recovery marker are required to make the transition recoverable.

**Acceptance criteria**

- Switching either direction migrates the complete library and future CRUD uses only the selected root.
- A failed or interrupted switch does not lose or silently replace notes or vault metadata.
- Relaunch resumes cleanup or migration deterministically.

### Milestone 3 — Make the settings interaction transactional and honest

**Goal:** Ensure the visible selection reflects completed storage state, not an optimistic click.

**Deliverables**

- Update `src/components/shell/SettingsPanel.tsx` to:
  - replace the misleading “iCloud” local-storage label with copy such as “Documents & Backup” and “On device”;
  - briefly explain that cross-device synchronization is provided by Cloud Sync;
  - await `window.appApi.setSetting("iosStorage", next)`;
  - disable both choices and expose an accessible busy state during migration;
  - update `useSettingsStore` only after success;
  - retain the previous selection and show an actionable error if migration fails.
- Before migration, flush the current editing buffer through `useNotesStore` so the latest pending autosave is included. After success, call `reloadLibrary()` and preserve the active note ID/content where possible.
- Update `src/components/App.tsx` to hydrate only normalized canonical values returned by the iOS shim. Ensure startup hydration and `NotesShell` library loading cannot race past storage initialization.
- Reuse the existing AppApi settings boundary; no Electron, browser, fetch, or Capacitor calls should be added directly to generic components beyond the existing `window.appApi` contract.

**Dependencies:** Milestone 2’s awaited migration behavior.

**Risks:** Switching while the 600 ms autosave is pending can copy stale content unless the buffer is flushed or writes are serialized before the snapshot.

**Acceptance criteria**

- The control is native-iOS-only.
- The displayed choice always matches the active persisted location.
- Switching cannot race with autosave, repeat taps, or Cloud Sync writes.

### Milestone 4 — Add regression coverage

**Goal:** Prove routing, migration, persistence, and platform isolation without relying only on a device pass.

**Deliverables**

- Add `src/tests/iosNotesStorage.test.ts` (or `src/tests/capacitorApi.test.ts`) with a stateful mocked Capacitor Filesystem covering:
  - Documents and LibraryNoCloud are the only note roots; `Directory.Data` is never used;
  - default and canonical persisted choices;
  - legacy `icloud` normalization;
  - legacy `device` migration from Documents to LibraryNoCloud;
  - create/read/list/write/delete and scaffold routing in each mode;
  - migration in both directions;
  - note body/ID/timestamp and tombstone preservation;
  - target-only stale files, duplicate IDs, and exact reconciliation;
  - copy/write/readback/atomic-activation/source-cleanup failure points;
  - cleanup failure resolving on the target, including a legacy `device` upgrade that never returns to a partially deleted source;
  - interruption recovery, cleanup-marker retry, and concurrent-write serialization;
  - corrupt metadata failing safely.
- Add `src/tests/SettingsPanel.test.tsx` to verify:
  - the Storage section appears when `isNativePlatform()` is true;
  - it is absent for browser/Electron and for Capacitor’s non-native web shim;
  - labels/descriptions do not promise iCloud Drive sync;
  - the control awaits migration, prevents repeat clicks, updates on success, and rolls back on rejection.
- Update `src/tests/appDefaults.test.ts` for the canonical default.
- If the buffer-flush orchestration is extracted, add a focused test showing a pending edit is saved before migration and the library is reloaded afterward.

**Dependencies:** Milestones 1–3.

**Risks:** Module-level Capacitor imports and singleton Zustand stores need resettable mocks to prevent test leakage.

**Acceptance criteria**

- Automated tests cover every issue scenario and the migration decision.
- Existing Electron, web, notes-store, and Cloud Sync behavior remains green.

### Milestone 5 — Correct docs and perform native verification

**Goal:** Align claims with actual behavior and gather the evidence needed to close issue #8.

**Deliverables**

- Update `docs/ios-icloud.md`:
  - document Documents vs `LibraryNoCloud` accurately;
  - explain migration behavior and legacy upgrade behavior;
  - retain Files-app/plist guidance;
  - state that true iCloud ubiquity remains deferred.
- Update `docs/passwordless-vault-sync.md` and `README.md` to remove stale Documents/Data and “iCloud” local-option wording while preserving encrypted Cloud Sync as the cross-device path.
- Update root `IMPLEMENTATION_PLAN.md` and `progress.txt` when implementation starts/completes so Phase 9 reflects the corrected scope and native verification.
- Run:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`
  - `bun run web:build`
  - `bun run ios:build`
  - `bun run ios:sync` where an iOS project is available
  - existing Playwright smoke tests for non-iOS regressions
- On an iOS simulator, use the app container (for example through Xcode or `xcrun simctl get_app_container`) to verify:
  - Documents mode writes `Documents/notes`;
  - On-device mode writes under `Library/NoCloud/notes`;
  - switching both ways preserves notes and removes or schedules cleanup of the previous copy;
  - create, edit, delete, relaunch, and switch-again behavior;
  - upgrade from both legacy `icloud` and legacy `device` settings.
- Repeat backup/Files-visibility-sensitive checks on a signed physical iOS device. Record the chosen migration behavior and native evidence in the issue/PR before closure.

**Dependencies:** All implementation and automated tests complete; Xcode/iOS runtime available.

**Risks:** `ios/App/` is ignored and absent from this checkout, so native plist/capability state is not reproducibly represented by tracked source. Device verification must record the exact setup used.

**Acceptance criteria**

- Native inspection proves physically distinct roots and persistence across relaunch.
- Documentation makes no claim that the local Documents option provides live iCloud Drive synchronization.

## 5. Test strategy

### Unit and integration

- Stateful Filesystem mock for storage routing, migration, metadata, failure, recovery, and serialization.
- React Testing Library coverage for native-only rendering and transactional settings behavior.
- Existing notes-store and vault-sync suites to verify IDs, timestamps, tombstones, and Cloud Sync remain unchanged.

### Build and regression

- TypeScript, ESLint, full Vitest, web build, iOS build/sync, and existing Playwright suites.
- Confirm Electron and web never render the iOS storage section and retain their current storage implementations.

### Manual native QA

- Fresh install in each mode.
- Upgrade from the currently shipped partial implementation with each legacy preference.
- Switch Documents -> On device -> Documents with multiple notes and a pending edit.
- Relaunch after each switch; create/edit/delete after relaunch.
- Inspect the simulator/device container to prove paths and previous-root cleanup.
- Exercise a simulated migration failure in debug tooling if available; otherwise rely on injected-failure tests and verify retry UX on device.

## 6. Acceptance-criteria mapping

| Issue #8 scenario / criterion | Milestone(s) | How verified |
| --- | --- | --- |
| Storage section renders on iOS | 3, 4 | `SettingsPanel` native-runtime component test; simulator QA |
| Storage section is absent on web and Electron | 3, 4 | Component tests with absent/non-native Capacitor global; web/Electron smoke |
| Two storage choices are offered | 1, 3 | UI test and native QA; wording reflects Documents/backup vs private on-device storage |
| Selecting On device applies to new creates and edits | 1, 2, 4, 5 | Filesystem routing tests; container-path inspection on iOS |
| Notes read from the on-device location after relaunch | 2, 4, 5 | Persistence/initialization test; terminate/relaunch simulator/device |
| The choice is remembered | 1–4 | Canonical setting hydration test and relaunch QA |
| Existing notes have a documented migration/copy behavior | 2, 5 | Failure/retry migration tests; docs and issue/PR record |
| Existing note data is not lost when switching | 2, 4, 5 | Both-direction migration, metadata, interruption, and device switch matrix |

## 7. Out of scope / deferred

- True iCloud Drive ubiquity-container storage or Apple-device-to-Apple-device filesystem sync.
- New iCloud entitlements, a native ubiquity-container Capacitor plugin, and iCloud conflict resolution.
- Changes to encrypted Cloud Sync protocol, crypto, API, or S3 storage.
- Changes to Electron or browser notes locations.
- General import/export file-location behavior outside the notes library.
- Any unrelated editor, theme, or mobile-toolbar work already present in the working tree.

## 8. Implementation status (2026-09-11)

Milestones 1–4 and the documentation half of Milestone 5 are implemented in the working tree (see `docs/W-000008-progress.txt` for the per-item record):

- `src/ios/notesStorage.ts` (new) — canonical mapping, legacy normalization, explicit-directory helpers, strict metadata parsing, `copyAndVerify`, and `createNotesStorageController` (serialized init / migration / CRUD, `iosStorageMigration` recovery marker).
- `src/ios/capacitorApi.ts` — all notes-library operations route through the controller; `getSetting`/`setSetting("iosStorage")` are answered by it; generic file/export paths unchanged; `Directory.Data` no longer referenced.
- `src/services/settingsStore.ts` — `IosStorage = "documents" | "private"`, default `documents`, `isIosStorage` guard.
- `src/components/shell/SettingsPanel.tsx` — “Documents & Backup” / “On device” radio pills, Cloud Sync hint, awaited `switchIosStorage` (flush → setSetting → store → reload), busy/disabled state, error rollback.
- `src/components/App.tsx` — hydrates only canonical values.
- Tests: `src/tests/iosNotesStorage.test.ts` (25), `src/tests/SettingsPanel.test.tsx` (8), `src/tests/appDefaults.test.ts` (updated default).
- Docs: `README.md`, `docs/ios-icloud.md`, `docs/passwordless-vault-sync.md`, root `IMPLEMENTATION_PLAN.md` / `progress.txt`.

Chosen migration behavior (recorded for the issue/PR): **move, not copy** — the source library is removed after the target is verified and the preference is activated; a cleanup marker retries removal on the next launch if it is interrupted. Legacy `"device"` installs are migrated Documents → LibraryNoCloud on first launch because their data physically lives in Documents.

## 9. Remaining steps

1. Native verification (Milestone 5, items 5.2–5.4) on an iOS simulator and a signed device using the recipe in `docs/ios-icloud.md` — the implementation host for this pass had no iOS runtime, so **no native evidence exists yet**.
2. Optionally run the Playwright smoke suite for non-iOS regressions (`bun run test:e2e`).
3. Record the migration behavior and native evidence on issue #8, then open the shipping PR with `Closes #8`.
4. On merge, move this plan and `docs/W-000008-progress.txt` to `docs/archive/`.
