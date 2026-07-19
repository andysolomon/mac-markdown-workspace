# Mac Markdown Workspace

A Bear-inspired, local-first Markdown **notes workspace** — tag sidebar, document list, and a distraction-free editor — built as a **single React codebase that ships to macOS desktop, the browser, and iOS**.

**[▶ Live demo](https://mac-markdown-workspace.vercel.app)** · **[📖 Engineering docs](https://mac-markdown-docs.vercel.app)**

The design system's core rule: **structure is colored, prose is not.** Heading hashes, list bullets, checkboxes, quote bars, and link brackets render in the active theme's accent — in both the editor and the preview — while your words stay neutral and readable.

## Features

- **Notes library** — multiple notes with autosave; titles, previews, and `#hashtags` derive live from content. Tag filtering and instant search across everything.
- **Three-pane workspace** — traffic dots, "All" pill, and hashtag sidebar · document list with search · editor column. One tap on the list icon collapses both panels for a full-width, distraction-free editor.
- **Structure-colored editing** — CodeMirror 6 with a custom theme keyed to the design tokens; source, split, and preview modes. Opens in Source.
- **Four palettes × light/dark** — Teal, Forest, Gold, Crimson, each with a derived dark variant, switched live from the **Aa** popover along with nine curated editor faces and a text-size stepper. Everything persists per platform.
- **Exports** — standalone themed **HTML**, **PDF**, TXT, and DOCX. iOS Safari delivers through the native share sheet.
- **Mobile editing kit** — Bear-style bottom tool strip (share · Aa · +) and a markdown helper bar that rides above the on-screen keyboard (#, bold, italic, lists, tasks, quotes, code, links, indent, Done).
- **Cloud sync (optional)** — passwordless, end-to-end encrypted sync across devices. A passphrase (never sent anywhere) derives the keys on-device; the API and S3 only ever hold ciphertext. Link a new device by sharing a **vault code**. See [`docs/passwordless-vault-sync.md`](./docs/passwordless-vault-sync.md).
- **Settings** — toolbar visibility toggle; Cloud Sync setup; iOS notes storage location (see `docs/ios-icloud.md`).
- **Local-first storage** — Electron: a real folder of `.md` files in `~/Documents/Mac Markdown`; web: IndexedDB; iOS: Capacitor Filesystem under Documents.

## Tech stack

React 19 · TypeScript · Vite · Zustand · CodeMirror 6 · Electron (Forge) · Capacitor · react-markdown (remark/rehype) · @noble crypto · Vercel Functions + AWS S3 (cloud sync) · Vitest · Playwright. Package manager: **Bun**.

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

For Files-app visibility and on-device iOS storage options, see [`docs/ios-icloud.md`](./docs/ios-icloud.md). Cross-device syncing uses **Cloud sync** (above), not iCloud Drive — the native iCloud-container bridge is intentionally deferred in favor of the encrypted vault.

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

For visual testing across the Mac app, web, and iOS (screenshots, Playwright
baselines, Simulator), see [`docs/visual-testing.md`](./docs/visual-testing.md).

> Use `bun run test`, not `bun test`. The latter invokes Bun's built-in runner, which lacks a jsdom environment and picks up the Playwright specs in `e2e/`, producing spurious failures. The real suite runs through `vitest`.

## Architecture

The components are **platform-agnostic and UI-only** — all host capability (notes storage, file dialogs, exports, settings, menu events) goes through a single typed interface, `window.appApi` (`AppApi` in `shared/types/ipc.ts`). Each target supplies its own implementation:

| Target   | Entry point         | `AppApi` implementation | Notes storage                              |
|----------|---------------------|-------------------------|---------------------------------------------|
| Electron | `src/renderer.tsx`  | `src/preload.ts` → IPC → `src/main.ts` | `.md` files in `~/Documents/Mac Markdown` |
| Web      | `src/web/entry.tsx` | `src/web/browserApi.ts` | IndexedDB                                   |
| iOS      | `src/ios/entry.tsx` | `src/ios/capacitorApi.ts` | Capacitor Filesystem (`Documents/notes`)  |

Notes are raw markdown keyed by a stable id; titles, previews, and tags always **derive from content** (`src/services/notesModel.ts`), so the UI is identical everywhere. The design system lives as CSS custom properties in `src/styles/tokens/` (four palettes + derived dark variants + markdown role colors), applied via `data-theme` / `data-mode` on `<html>`.

### Cloud sync

An optional sync layer sits **above** the platform shims — it never replaces `AppApi`. A **vault** is one end-to-end-encrypted snapshot of the library in S3, addressed by a public **vault code** and unlocked by a passphrase that never leaves the device (scrypt + HKDF → AES-256-GCM, with the vault id bound as AEAD associated data). Merge is last-write-wins per note id with two-sided tombstones; the Vercel API stores only ciphertext and a hash of the write token, and conditional writes (S3 ETag ↔ `If-Match`) keep concurrent devices consistent. Full design, threat model, and hardening rounds: [`docs/passwordless-vault-sync.md`](./docs/passwordless-vault-sync.md).

For deeper architecture notes and conventions, see [`CLAUDE.md`](./CLAUDE.md).

## License

MIT © Andrew Solomon
