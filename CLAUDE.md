# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Bear-inspired, local-first Markdown **notes workspace**: tag sidebar · document list · distraction-free editor, dressed in the "Mac Markdown" design system (four palettes × light/dark, structure-colored markdown). The **same React app** ships to three targets — Electron desktop, browser (web), and iOS (Capacitor) — from one shared component tree.

## Commands

Package manager is **Bun** (`bun install`). Build tooling is Vite; tests are Vitest + Playwright.

```bash
# Desktop (Electron)
bun start                 # electron-forge start (dev)
bun run make              # build distributable macOS app

# Web
bun run web:dev           # Vite dev server on :3000 (base /mac-markdown-workspace/)
bun run web:build         # build to dist-web/

# iOS (Capacitor)
bun run ios:sync          # build + npx cap sync ios
bun run ios:open          # open Xcode project

# Quality gates (all must pass)
bun run typecheck         # tsc --noEmit
bun run lint              # eslint --ext .ts,.tsx .
bun run test              # vitest run (unit; excludes e2e/). NOT `bun test` — see below
bun run test:e2e          # playwright, config e2e/playwright.config.ts

# Single test file / name
bunx vitest run src/tests/notesModel.test.ts
bunx vitest run -t "extracts inline hashtags"
```

> Use `bun run test`, never `bun test`. `bun test` invokes Bun's built-in runner, which has no jsdom environment and wrongly picks up the Playwright specs in `e2e/` — producing spurious `document is not defined` and `test.describe()` failures.

## Architecture: the platform-abstraction boundary

The most important concept. Components are **UI-only and platform-agnostic** — they never call Electron, `fetch`, or Capacitor directly. All host capability goes through **`window.appApi`**, typed as `AppApi` in `shared/types/ipc.ts`: notes CRUD (`listNotes/readNote/createNote/writeNote/deleteNote` over `RawNote`), file open/save (legacy import/export), exports (`exportTxt/Pdf/Docx/Html`), settings (`getSetting/setSetting`), dialogs, menu events.

Each target assigns its shim to `window.appApi` **before** any component imports run:

| Target   | Entry point          | `AppApi` implementation        | Notes storage                                  |
|----------|----------------------|--------------------------------|------------------------------------------------|
| Electron | `src/renderer.tsx`   | `src/preload.ts` + `ipcMain` in `src/main.ts` | `.md` files in `~/Documents/Mac Markdown` (fs) |
| Web      | `src/web/entry.tsx`  | `src/web/browserApi.ts`        | IndexedDB (`mmw-notes`)                        |
| iOS      | `src/ios/entry.tsx`  | `src/ios/capacitorApi.ts`      | Capacitor `Documents/notes` or `Library/NoCloud/notes` per the setting; reads use only the active root |

Adding a host capability: extend the `AppApi` type, implement in **all three** shims. Components treat `window.appApi?.method?.()` as possibly absent.

### Electron security model
`main.ts` owns all filesystem/dialog/menu access. Renderer runs `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; preload exposes only the typed surface. Menu clicks forward as string actions → `menu-action` CustomEvent on `window` (handled in `useKeyboardShortcuts`).

## Notes library data flow

- **`notesModel.ts`** — pure derivation: `deriveTitle`, `derivePreview`, `extractTags` (Bear-style `#hashtags`; excludes headings, code spans, URL fragments), `buildTagIndex`, `filterNotes`. Everything the UI shows derives from the note body — never stored separately.
- **`notesStore.ts`** (Zustand) — `notes` (newest-first), `activeNoteId`, `selectedTag`, `searchQuery`; seeds a welcome note on first run.
- **`NotesShell.tsx`** — the container. `documentStore` remains the **editing buffer**: selection syncs the active note into it; edits autosave back debounced (600ms) with flush-on-switch. **Critical invariant:** anything that loads foreign content into the buffer (Open/Import, drag-drop, Cmd+N) must create a **new note** instead of writing the buffer, or autosave will overwrite the active note. Selection clears `filePath` so file-save shortcuts can't write a note over an opened file.
- Array-building selectors (tag index, filtered list) are derived with `useMemo` in components — passing them to `useNotesStore` directly loops `useSyncExternalStore` (fresh reference per snapshot) and blanks the app.

## Design system (tokens → theme → surfaces)

- **Tokens** (`src/styles/tokens/`): kit files verbatim (`colors/typography/spacing/markdown.css`) + `colors-dark.css` (derived dark variants, not from the kit). Four palettes (teal/forest/gold/crimson) × light/dark via `data-theme` + `data-mode` **on `<html>`** — the `--md-*` markdown roles resolve at `:root`, so theming a subtree silently breaks them.
- **`themeStore`** — `{palette, mode, resolvedMode, font, size}`; App applies attributes + `--mm-font-editor`/`--mm-editor-size`. The Aa popover (`FontPopover`) and settings persist via AppApi settings keys: `palette`, `mode`, `font`, `size`, `showToolbar`, `iosStorage`.
- **Editor** (`markdownEditorTheme.ts`): a CodeMirror `HighlightStyle` — all Lezer markdown marks share `processingInstruction` → one rule colors every structural mark `--md-marker`; prose stays neutral; bold is weight, not color. All values are CSS custom properties, so theme switches restyle live without extension rebuilds.
- **Read modes**: `.preview` rules in `index.css` map to the same `--md-*` roles.
- `compat.css` bridges legacy `--bg-*/--text-*` names for the remaining transitional toolbar chrome.

### CodeMirror gotcha (learned the hard way)
Duplicate `@codemirror/language` instances make `syntaxHighlighting()` silently no-op (split facets). Guarded by `resolve.dedupe` in **all three** Vite configs plus `package.json` `overrides`. If editor highlighting ever vanishes while the chrome theme still applies, check for nested copies first.

## iOS Safari gotchas (export path)

- Programmatic downloads: anchor must be DOM-attached and the object URL revoked on a delay — iOS aborts on synchronous revoke.
- Transient user activation does **not** survive `await import(...)` chains: `exportActions` must be **statically imported** by click handlers, and the touch-WebKit PDF path pre-opens its tab synchronously in the click call stack before any await.
- Touch devices deliver files through `navigator.share`; detect native Capacitor with `Capacitor.isNativePlatform()` — the bare `window.Capacitor` global also exists in web bundles.

## Shell components (`src/components/shell/`)

`NotesShell` (container) · `Sidebar`/`Tag` · `DocList`/`DocListItem` · `EditorChrome` (nav · Aa · optional inline Toolbar · + · ⋯; list icon toggles BOTH panels → full-width editor) · `FontPopover` · `SettingsPanel` · `BottomBar` + `MarkdownAccessoryBar` (mobile, swap on editor focus; accessory inserts via `src/services/editorBridge.ts` — buttons use mousedown `preventDefault` to keep editor focus). Layout CSS in `src/styles/shell.css`; mobile collapse at the 640px breakpoint is tracked with a **live matchMedia listener** (never sample width once at mount).

## Working conventions

- **Testing rules: @AGENTS.md** — E2E-first; no unit tests written after the code; isolated tests only for listed failure modes the E2E suite can't reach.
- Keep `IMPLEMENTATION_PLAN.md` and `progress.txt` in sync when scope changes; work is tracked as `[W-0000NN]` GitHub issues (Gherkin ACs) — reference `Closes #N` in commits.
- Components are `React.memo`-wrapped where decomposed for perf — preserve prop stability.
- Verify phases in the running app (agent-browser / Playwright WebKit / real Safari via safaridriver), not just tests.
- Do not push, merge, or deploy unless explicitly asked (pushing `main` auto-deploys production via Vercel).
