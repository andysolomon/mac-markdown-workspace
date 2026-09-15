# Issue #25 — Launcher, MIME association, and single-instance file opening

**Story:** [#25](https://github.com/andysolomon/mac-markdown-workspace/issues/25) — Integrate launcher, Markdown file associations and single-instance file opening  
**Branch:** `feat/issue-25-launcher-integration` (parent-owned ship)

## 1. Product goal and scope boundaries

Linux installed builds expose a stable desktop identity with a launcher entry, an opt-in Markdown MIME association, CLI file opening, and `requestSingleInstanceLock` semantics. Cold start, second-instance activation, and macOS `open-file` events funnel through one queue that drains after the renderer signals ready. Each requested Markdown file is imported exactly once into the library as a new note and never overwrites an active dirty buffer.

In scope:

- `src/main.ts` argv parsing, single-instance lock, second-instance handler, macOS `open-file`, `host:open-files` after `did-finish-load` + renderer-ready.
- Additive `AppApi.onHostOpenFiles` (preload + `shared/types/ipc.ts` only).
- `useHostOpenFiles` mounted from `NotesShell`, gated by `confirmDiscardIfDirty` / `createNote`.
- Tracked `.desktop` template + icon under `packaging/linux`, copied into the ZIP as `resources/linux/` via `extraResource`.
- Unit tests, Playwright launcher spec, operator docs, and a dated Omarchy validation record.

Out of scope:

- Shared React editor, web/iOS shims, AppApi methods other than additive `onHostOpenFiles`.
- URI / `x-scheme-handler` registration.
- Writing `xdg-mime default` or `update-desktop-database` (owned by #24 PKGBUILD).
- Package install/upgrade workflow (#24), Hyprland (#26), CI (#29).

## 2. Current baseline

- #23 (PR #32) ships `executableName=mac-markdown-workspace`, `appBundleId=com.andrewsolomon.mac-markdown-workspace`, and `extraResource` icons + LICENSE.
- #27/#28 (PR #31) close/quit flush handshake and vault/CSP/buffer reconciliation are intact.
- `useFileOperations.openFile` already imports via `createNote(content)`.
- `src/main.ts` had no argv ingestion, second-instance handler, or `requestSingleInstanceLock`.
- No tracked `.desktop` or MIME integration. Host `text/markdown` default is `omawrite.desktop`.

## 3. Missing capabilities

| Capability | Gap | Planned outcome |
| --- | --- | --- |
| Desktop identity | ZIP has icons but no `.desktop` | `packaging/linux/mac-markdown-workspace.desktop` + icon in `resources/linux/` |
| CLI / file-manager open | No argv / `open-file` path | Parser + queue + `host:open-files` |
| Single instance | Competing writers possible | `requestSingleInstanceLock`; second instance focuses + enqueues |
| Dirty-buffer safety | Host open could clobber edits | `confirmDiscardIfDirty` then `createNote` per path |
| Opt-in MIME | None | `MimeType=` on the template only; no silent default override |

## 4. Milestones and phases

### Phase 1 — Packaging identity

**Goal:** Ship a validated `.desktop` template and icon inside the Linux ZIP without installing them.

**Deliverables:** `packaging/linux/mac-markdown-workspace.desktop` (`Exec=mac-markdown-workspace %F`, `MimeType=text/markdown;text/x-markdown;`, `StartupWMClass=mac-markdown-workspace`, `Icon=mac-markdown-workspace`, no URI handlers); `packaging/linux/icon.png`; `forge.config.ts` extraResource entry.

**Acceptance:** ZIP `resources/linux/` contains the desktop file + icon; `desktop-file-validate` parses OK; `xdg-mime query default text/markdown` remains `omawrite.desktop`.

### Phase 2 — Host queue and IPC

**Goal:** One queue for argv, second-instance, and macOS `open-file`, drained after `did-finish-load` and renderer-ready.

**Deliverables:** `argvParser`, `hostOpenFilesQueue`, main-process wiring, preload `onHostOpenFiles`.

**Acceptance:** Unit tests cover spaces/Unicode/leading-dash, Chromium flags, coalesce-before-ready, immediate-after-ready.

### Phase 3 — Renderer import

**Goal:** Import each path once as a new note; confirmDiscard gates every batch.

**Deliverables:** `useHostOpenFiles`, NotesShell mount. `useFileOperations.openFile` semantics unchanged.

**Acceptance:** Missing/unreadable/unsupported paths toast an error and do not overwrite another note.

### Phase 4 — Evidence

**Goal:** Automated and Omarchy Wayland records.

**Deliverables:** Playwright `e2e/launcher-integration.spec.ts`; `docs/launcher-integration.md`; `docs/launcher-integration-validation-2026-09.md`.

## 5. Out-of-scope and deferred

#24 installs the `.desktop` and icon system-wide. #26 consumes `StartupWMClass`. No URI schemes.

## 6. Immediate next steps

1. Independent Verify of this tree.
2. Parent-owned commit/PR (`Closes #25`) after authorization. Do not push main or deploy.
