# Mac Markdown Workspace

A polished, local-first Markdown workspace with source editing, live preview, and WYSIWYG mode — built as a **single React codebase that ships to macOS desktop, the browser, and iOS**.

**[▶ Live demo](https://mac-markdown-workspace.vercel.app)**

## Features

- **Three editing modes** — source (CodeMirror 6), split preview, and WYSIWYG (Milkdown), plus a read-only preview mode.
- **Rich rendering** — GitHub-Flavored Markdown, Mermaid diagrams, KaTeX math, emoji, and syntax-highlighted code blocks.
- **Themes** — light / dark / system, applied via CSS variables.
- **Exports** — TXT, PDF, and DOCX.
- **Local-first** — open and save files directly; no account, no cloud.
- **Cross-platform from one codebase** — desktop (Electron), web (File System Access API), and iOS (Capacitor), with a mobile-responsive UI.
- **Keyboard-driven** — Cmd+S/Shift+S/O/N for files, Cmd+1/2/3 for modes, optional Vim keybindings in the source editor.

## Tech stack

React 19 · TypeScript · Vite · Zustand · CodeMirror 6 · Milkdown · Electron (Forge) · Capacitor · react-markdown (remark/rehype) · Vitest · Playwright. Package manager: **Bun**.

## Getting started

Requires [Bun](https://bun.sh).

```bash
bun install
```

### Run the desktop app (Electron)

```bash
bun start
```

### Run in the browser

```bash
bun run web:dev        # Vite dev server on http://localhost:3000
```

### Run on iOS (Capacitor)

```bash
bun run ios:sync       # build the web bundle + sync into the iOS project
bun run ios:open       # open in Xcode to run on a simulator/device
```

## Building

```bash
bun run make           # package a distributable macOS app (Electron Forge)
bun run web:build      # build the web app to dist-web/
bun run ios:build      # build the iOS web bundle
```

## Testing & checks

```bash
bun run typecheck      # tsc --noEmit
bun run lint           # eslint
bun run test           # unit tests (Vitest) — note: NOT `bun test`
bun run test:e2e       # end-to-end (Playwright)
```

> Use `bun run test`, not `bun test`. The latter invokes Bun's built-in runner, which lacks a jsdom environment and picks up the Playwright specs in `e2e/`, producing spurious failures. The real suite runs through `vitest`.

## Architecture

The renderer and components are **platform-agnostic and UI-only** — they never call Electron, Capacitor, or the network directly. All host capability (file I/O, dialogs, exports, settings, native menu events) goes through a single typed interface, `window.appApi` (`AppApi` in `shared/types/ipc.ts`). Each target supplies its own implementation:

| Target   | Entry point         | `AppApi` implementation | Mechanism                                   |
|----------|---------------------|-------------------------|---------------------------------------------|
| Electron | `src/renderer.tsx`  | `src/preload.ts`        | contextBridge over IPC to `src/main.ts`     |
| Web      | `src/web/entry.tsx` | `src/web/browserApi.ts` | File System Access API, localStorage        |
| iOS      | `src/ios/entry.tsx` | `src/ios/capacitorApi.ts` | Capacitor Filesystem / Share plugins      |

The Electron main process owns all filesystem and dialog access; the renderer runs sandboxed (`contextIsolation`, no `nodeIntegration`) and is treated as untrusted. Document state is centralized in a Zustand store (`src/services/documentStore.ts`), where dirty state is derived by comparing current vs. last-saved content.

Adding a host capability means updating the `AppApi` type once and implementing it in all three shims.

For deeper architectural notes and conventions, see [`CLAUDE.md`](./CLAUDE.md).

## License

MIT © Andrew Solomon
