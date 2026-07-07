---
title: The platform-abstraction boundary
description: How one React component tree runs natively on Electron, the browser, and iOS through a single typed capability interface.
---

The most important idea in the codebase: **components are UI-only and
platform-agnostic.** They never call Electron, `fetch`, or Capacitor directly.
Every host capability — notes storage, file dialogs, exports, settings, menu
events — goes through one typed interface, `window.appApi`, declared as `AppApi`
in `shared/types/ipc.ts`.

Each target assigns its own implementation to `window.appApi` **before** any
component imports run:

| Target   | Entry point          | `AppApi` implementation                       | Notes storage                                   |
| -------- | -------------------- | --------------------------------------------- | ----------------------------------------------- |
| Electron | `src/renderer.tsx`   | `src/preload.ts` + `ipcMain` in `src/main.ts` | `.md` files in `~/Documents/Mac Markdown` (fs)  |
| Web      | `src/web/entry.tsx`  | `src/web/browserApi.ts`                       | IndexedDB (`mmw-notes`)                          |
| iOS      | `src/ios/entry.tsx`  | `src/ios/capacitorApi.ts`                     | Capacitor Filesystem under `Documents/notes`    |

Adding a host capability means extending the `AppApi` type and implementing it in
**all three** shims. Components treat `window.appApi?.method?.()` as possibly
absent, so a target that hasn't implemented something degrades instead of
crashing.

## Why this shape

The payoff is that the entire notes UI — the three-pane shell, the CodeMirror
editor, the tag index, autosave — is written once and is byte-for-byte identical
across desktop, web, and mobile. Platform differences are quarantined to three
small files that all satisfy the same contract.

Notes are raw Markdown keyed by a stable id. Everything the UI displays — title,
preview, `#hashtags` — **derives from the note body** (`src/services/notesModel.ts`)
rather than being stored separately, so there is no cross-platform schema to keep
in sync beyond `{ id, body, updatedAt }`.

## The Electron security model

`main.ts` owns all filesystem, dialog, and menu access. The renderer runs with
`contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`; the
preload script exposes only the typed surface. Native menu clicks are forwarded
as string actions onto a `menu-action` CustomEvent on `window`, handled in
`useKeyboardShortcuts` — the renderer never gets a Node handle.

## Where sync fits

Cloud sync sits **above** this boundary — it does not replace `AppApi`. The sync
engine reads and writes local notes through a small `LocalNotesPort` adapter over
the same shim, so it stays platform-agnostic too. See
[Crypto & sync engine](/sync/crypto-engine/).
