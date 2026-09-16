# Issue #25 Follow-ups — Test gaps and a queue-drain race

**Stories:**
- [#34](https://github.com/andysolomon/mac-markdown-workspace/issues/34) — Unit tests for `confirmDiscardIfDirty` save/discard/cancel
- [#35](https://github.com/andysolomon/mac-markdown-workspace/issues/35) — `sendOpenFiles` silently dropping the queue on destroyed window mid-drain
- [#36](https://github.com/andysolomon/mac-markdown-workspace/issues/36) — Strengthen second-instance E2E to assert window focus and imported note
- [#37](https://github.com/andysolomon/mac-markdown-workspace/issues/37) — E2E for mixed-batch host import (readable + missing path)

**Branch:** `feat/issue-25-followups`

## 1. Product goal and scope boundaries

Close out the review notes from #25 (PR #33) without regressing shipped behavior. One real correctness bug (`#35` — the queue can be lost mid-drain), plus three test gaps (`#34`, `#36`, `#37`) that strengthen the existing acceptance criteria. No new user-visible behavior; the only new code path is the drain-loss recovery in `src/main.ts`.

In scope:

- `src/main.ts`: decide between "re-queue on next `createMainWindow`" and "show `dialog.showMessageBox`" for the destroyed-window mid-drain case, document the trade-off next to `sendOpenFiles`.
- `src/tests/useFileOperations.test.ts` (new): cover `confirmDiscardIfDirty` save/discard/cancel + clean-buffer short-circuit, with `useNotesStore`/`useDocumentStore` mocked per the existing `src/tests/setup.ts` pattern.
- `e2e/launcher-integration.spec.ts`: add focus + active-note assertions to the second-instance case; add a mixed-batch (readable + missing) cold-start case.

Out of scope:

- macOS dialog open, `useFileOperations.openFile` semantics, close/quit flush from #27, vault sync from #28, web/iOS shims, shared React editor.
- Changing the `.desktop` `Exec=` line or `MimeType` registration.
- #24, #26, #29.

## 2. Current baseline

- `src/main.ts:40` — `sendOpenFiles` returns silently when the window or webContents is destroyed, after the queue has already drained the pending batch into the listener call.
- `src/hooks/useFileOperations.ts:19` — `confirmDiscardIfDirty` delegates to `checkDirtyAndProceed`; the dialog is `dialog:confirm-discard` with three choices mapped to `save | discard | cancel`.
- `src/hooks/useHostOpenFiles.ts:53` — subscribes once notes are loaded; chain per batch with `confirmDiscardIfDirty` → `flushNoteSaves` → `readFile` → `createNote`.
- `e2e/launcher-integration.spec.ts:101` — existing second-instance test asserts only `Locator('text=Launcher Second Instance')` visibility; no focus or active-note check.
- Existing test infrastructure: `src/tests/documentStore.test.ts`, `src/tests/notesStore.test.ts`, `src/tests/setup.ts` (jsdom + zustand store reset per test).

## 3. Missing capabilities

| Capability | Gap | Planned outcome |
| --- | --- | --- |
| Drain-loss guard (#35) | `sendOpenFiles` drops paths on a destroyed window | Either re-queue on next `createMainWindow` or `dialog.showMessageBox`; documented trade-off |
| Dirty-buffer unit coverage (#34) | No direct tests for `confirmDiscardIfDirty` branches | Four new test cases in `src/tests/useFileOperations.test.ts` |
| Second-instance focus + active-note (#36) | Existing case doesn't assert focus or active note | Strengthened assertions in the same `launcher-integration.spec.ts` block |
| Mixed-batch regression (#37) | Single-path missing case only | New case: one readable + one missing → readable imported, toast for missing, dirty buffer preserved |

## 4. Milestones and phases

### Phase 1 — #35 queue-drain guard (correctness)

**Goal:** Stop `sendOpenFiles` from silently dropping paths when the main window is destroyed between drain and IPC send.

**Deliverables:** `src/main.ts` change to `sendOpenFiles`; a one-line comment above the function explaining the chosen trade-off (re-queue vs. notify). If re-queue: add a tiny per-instance `lostSinceLastWindow: string[]` set, drained on the next `createMainWindow` and appended to the `openFilesQueue` via `enqueue`. If notify: single `dialog.showMessageBox` listing the dropped paths. Reuse `dialog` already imported.

**Risks:**
- Adding `enqueue` from a destroyed-window context must not recurse (already gated by `ready` in the queue — confirm with a unit test extension).
- The `dialog.showMessageBox` path must not run when `app.isQuitting` is true, to avoid a zombie dialog during quit.
- Existing close/quit flush handshake from #27 must remain intact (don't touch `installCloseGuard`).

**Acceptance:** Either re-queue or notify covers the destroyed-mid-drain window. Existing cold/warm second-instance tests still pass.

### Phase 2 — #34 confirmDiscardIfDirty unit tests

**Goal:** Direct coverage of every branch of `confirmDiscardIfDirty` so future refactors cannot silently regress the dirty-buffer gate.

**Deliverables:** New `src/tests/useFileOperations.test.ts` using the existing `setup.ts` jsdom + store-reset pattern. Four cases:

1. Clean buffer → short-circuit to `true`, no dialog call.
2. Dirty buffer + user picks `save` → `updateNote` called with buffer content, `markClean()` runs, returns `true`.
3. Dirty buffer + user picks `discard` → `markClean()` runs, no save IPC, returns `true`.
4. Dirty buffer + user picks `cancel` → no state mutation, returns `false`.

Mock `window.appApi.confirmDiscard` per case; spy on `useNotesStore.getState().updateNote` and `useDocumentStore.getState().markClean`. Match the `confirmDiscard` enum (`"save" | "discard" | "cancel"`).

**Risks:** `setup.ts` must reset `documentStore` content/savedContent between tests; otherwise the clean-buffer test inherits dirty state. Verify by adding a pre-test `useDocumentStore.setState({ content: "", savedContent: "" })` if needed.

**Acceptance:** All four cases pass under `bun run test`. No new dependencies. Test runs under `vitest` (not Playwright).

### Phase 3 — #36 second-instance focus + active-note assertions

**Goal:** Existing second-instance case must also prove that the existing window is focused and the imported note is the active selection.

**Deliverables:** Patch `e2e/launcher-integration.spec.ts` "second instance focuses the first window and imports the file" test:

- Before the second spawn, capture `window` handle (already captured) and assert `app.windows().length === 1`.
- After `spawnSecondInstance`, re-poll `app.windows().length` and fail if it becomes `> 1` (no new window).
- After the imported note appears in `.mm-doclist`, assert it is also the active selection (`page.locator('.mm-doclist-item.is-active')` or equivalent). Inspect `NotesShell` / `DocList` to discover the exact selector; fall back to comparing the doc-list title text against the editor's `.cm-content` first heading.
- Capture `await window.evaluate(() => document.hasFocus())` after `bringToFront` and assert `true` on the original window — this requires Playwright's window-focus assertion rather than DOM presence.

**Risks:** Electron window focus under Xvfb-less Linux is finicky. Use `page.bringToFront()` then `evaluate(() => document.hasFocus())`. If the headless harness never reports focus, the assertion must degrade to "still the only window" rather than skip.

**Acceptance:** Test fails when the second launch spawns a new window, or when the imported note is not the active selection. Existing 9 E2E tests still pass.

### Phase 4 — #37 mixed-batch E2E

**Goal:** Regression case for AC4's "mixed batch (one good + one bad) keeps the good import while toasting the bad one."

**Deliverables:** New test in `e2e/launcher-integration.spec.ts`:

- Cold start with two CLI paths: one readable Markdown file (`# Launcher Mixed Good`) and one missing path.
- Assert `.mm-doclist` contains the readable note (text `# Launcher Mixed Good`).
- Assert `.mm-toast` contains `missing or unreadable`.
- Assert the welcome note is still present (no clobbering).

**Risks:** Argv order must survive `parseOpenFileArgs` (already does — both `.md` paths hit the openable branch and dedupe). The missing file's `readFile` returns `null`; the existing missing-file case confirms toast wiring.

**Acceptance:** Test fails if the readable path is not imported, or if no toast appears, or if the welcome note disappears. Pass on Omarchy isolated-HOME smoke and locally under `bun run test:e2e`.

## 5. Out-of-scope and deferred

- Adding `requestSingleInstanceLock` failures to a dialog (existing PR #33 already quits silently — out of scope here).
- A general "lost-during-drain" metric/telemetry — future work.
- #24, #26, #29.

## 6. Immediate next steps

1. Parent-owned implement on `feat/issue-25-followups` (single PR closing #34, #35, #36, #37).
2. Independent Verify on the same tree.
3. Conventional commit + PR after operator authorization. Do not push main or deploy.
