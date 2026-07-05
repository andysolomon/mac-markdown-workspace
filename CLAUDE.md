# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A macOS-first local Markdown workspace: source editing (CodeMirror 6), rich preview, WYSIWYG editing (Milkdown), themes, and TXT/PDF/DOCX export. The **same React app** ships to three targets — Electron desktop, browser (web), and iOS (Capacitor) — from one shared component tree.

## Commands

Package manager is **Bun** (`bun install`). Build tooling is Vite; tests are Vitest + Playwright.

```bash
# Desktop (Electron)
bun start                 # electron-forge start (dev)
bun run make              # build distributable macOS app
bun run package           # package without makers

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
bunx vitest run src/tests/documentStore.test.ts
bunx vitest run -t "marks document dirty"
```

> Use `bun run test`, never `bun test`. `bun test` invokes Bun's built-in runner, which has no jsdom environment and wrongly picks up the Playwright specs in `e2e/` — producing spurious `document is not defined` and `test.describe()` failures. The real suite runs through the `vitest run` script.

## Architecture: the platform-abstraction boundary

This is the single most important concept. The renderer/components are **UI-only and platform-agnostic** — they never call Electron, `fetch`, or Capacitor directly. All host capability (file I/O, dialogs, exports, settings, menu events) goes through **`window.appApi`**, typed as `AppApi` in `shared/types/ipc.ts`.

Each target supplies its own `AppApi` implementation and assigns it to `window.appApi` **before** any component imports run:

| Target   | Entry point          | `AppApi` implementation        | Mechanism                                    |
|----------|----------------------|--------------------------------|----------------------------------------------|
| Electron | `src/renderer.tsx`   | `src/preload.ts`               | contextBridge over IPC to `src/main.ts`      |
| Web      | `src/web/entry.tsx`  | `src/web/browserApi.ts`        | File System Access API, localStorage, `<a download>` |
| iOS      | `src/ios/entry.tsx`  | `src/ios/capacitorApi.ts`      | Capacitor Filesystem/Share plugins           |

When you add a host capability: add the method to the `AppApi` type in `shared/types/ipc.ts`, then implement it in **all three** shims (`preload.ts` + a matching `ipcMain.handle` in `main.ts`, `browserApi.ts`, `capacitorApi.ts`). Components should treat `window.appApi?.method?.()` as possibly absent and degrade gracefully (see `App.tsx` drag-and-drop, which falls back to the File API when there's no Electron `file.path`).

### Electron security model
`main.ts` owns **all** filesystem, dialog, and menu access. The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Preload exposes only the minimal typed surface. Treat the renderer as untrusted. Native menu clicks are forwarded as string actions via `sendMenuAction` → `onMenuAction` → a `menu-action` CustomEvent on `window`.

## State

Zustand stores, single source of truth:
- `src/services/documentStore.ts` — `content`, `savedContent`, `filePath`, `viewMode` (`source | split | preview | wysiwyg`), `cursorPosition`. Dirty state is **derived**, not stored: `selectIsDirty` compares `content !== savedContent`; `markClean()` snapshots content into `savedContent`.
- `src/services/themeStore.ts` — `light | dark | system`; `resolvedTheme` is applied as `data-theme` on `<html>`, driving CSS variables in `src/styles/themes.css`.

## Rendering pipeline

- **Preview / split** — `src/services/markdownToHtml.ts` renders via react-markdown with remark-gfm, remark-math, remark-emoji and rehype-katex + rehype-pretty-code. Mermaid fences render through `MermaidBlock.tsx`. Split mode debounces render ~150ms.
- **WYSIWYG** — Milkdown (`WysiwygEditor.tsx`), `React.lazy`-loaded (code-split), commonmark preset. Edits flow back through `documentStore`.
- **Source** — CodeMirror 6 (`SourceEditor.tsx`) with markdown syntax, optional Vim keymap; dark theme (`@codemirror/theme-one-dark`) toggled by `resolvedTheme`.

## Build config notes

- Electron uses `forge.config.ts` → `plugin-vite` with three configs: `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`. `MAIN_WINDOW_VITE_*` globals are injected by the Vite plugin.
- Web and iOS have **separate** Vite configs (`vite.web.config.ts`, `vite.ios.config.ts`), each aliasing `path` → `path-browserify`. Web `base` defaults to the GitHub Pages path but is overridden to `/` via `VITE_BASE` for Vercel (`vercel.json`) — both output to `dist-web/`.
- iOS config uses `root: ios`, relative `base: "./"` (for `file://`), and `.app-shell` applies safe-area insets for notch/home indicator.
- Web deploys to GitHub Pages (Actions on push to main) and Vercel; iOS via Capacitor into `ios/App/` (gitignored).

## Working conventions

- Keep `IMPLEMENTATION_PLAN.md` and `progress.txt` in sync when scope changes (project convention; both track the phase history).
- Components are `React.memo`-wrapped where they were decomposed for perf (Preview, StatusBar, Toolbar, SourceEditor, WysiwygEditor) — preserve prop stability.
- Do not push, merge, or deploy unless explicitly asked.
