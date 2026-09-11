# Mac Markdown Workspace — Design Overhaul Implementation Plan

**Plan mode:** Gap mode. A single-document Markdown editor ships across macOS/web/iOS; this plan covers the work to reach the target: a Bear-style **three-pane notes workspace** dressed in the "Mac Markdown" design system.

**Design source of truth:** `~/Downloads/Mac-Markdown Design Overhaul/` (tokens, guidelines, components, `Mac-Markdown.dc.html`, screenshots). Kit assets are copied into the repo during Phase 1; the Downloads folder is reference only.

## 1. Product goal and scope boundaries

**Goal:** Rebuild the app from a single-file editor into a multi-note, tag-organized, search-driven three-pane workspace — tag sidebar · document list · distraction-free editor — where Markdown structure is colored in the active theme's accent and prose stays neutral. Ship it on all three existing targets (Electron, web, iOS) with four light themes **plus** a derived dark mode.

**In scope:**
- The full `--mm-*` / `--md-*` token layer, four light themes (Teal/Forest/Gold/Crimson) **and derived dark variants** of each.
- Avenir Next brand type (Nunito Sans web fallback) and the 20px-based editor scale.
- A **notes library**: multi-document model, tag extraction, search, and per-platform persistence.
- The three-pane shell and its components (WindowDots, Tag sidebar, DocList, editor chrome + Aa font popover).
- Structure-colored Markdown in both edit (CodeMirror) and read (rendered) surfaces.
- Cross-platform parity via the existing `window.appApi` abstraction, extended with a library surface.

**Out of scope / deferred:** see §5.

## 2. Current baseline (what exists)

- **Foundation shipped (v1):** React 19 single-document editor; one platform-agnostic component tree behind `window.appApi` (`AppApi` in `shared/types/ipc.ts`) with three shims — Electron (`preload.ts` + `main.ts` IPC), web (`src/web/browserApi.ts`), iOS (`src/ios/capacitorApi.ts`). Web entry wiring fixed + regression-tested (`src/tests/webEntry.test.ts`).
- **State:** `documentStore` (Zustand) holds one doc (content/savedContent/filePath/viewMode/cursorPosition); dirty is derived. `themeStore` = light/dark/system via `data-theme`.
- **Editing surfaces:** CodeMirror 6 source, react-markdown preview (remark/rehype: gfm, math, emoji; KaTeX; Mermaid via `MermaidBlock`).
- **Styling:** `src/styles/themes.css` (color-only tokens, 33 lines) + `src/index.css` (426 lines, flat class selectors, hardcoded spacing/type/radii).
- **File ops:** open/save/saveAs + TXT/PDF/DOCX export per platform. Checks: typecheck, lint, 19 Vitest tests, web + iOS builds, Playwright e2e (Electron).

## 3. Missing capabilities (the gap)

| Target capability | Today | Gap |
|---|---|---|
| Notes library (many docs) | one file at a time | new data model + persistence on all 3 platforms |
| Tags (`#hashtag`) | none | parse from content, index, counts, filter |
| Search across notes | none | client-side title+body search |
| Three-pane shell | toolbar + single workspace + status bar | sidebar + doc list + editor rebuild |
| Design tokens | color-only, no spacing/type/radius | full `--mm-*`/`--md-*` layer |
| Themes | light/dark/system | 4 light palettes + derived dark (palette × mode) |
| Structure-colored Markdown | oneDark / nord / default preview | accent-marker theme in edit + read |
| Brand type | SF/Inter stack | Avenir Next + Nunito Sans + Aa font picker |

## 4. Milestones / phases

Each phase is independently reviewable and keeps the app runnable.

### Phase 1 — Token foundation + dark derivation
- **Goal:** Establish the `--mm-*`/`--md-*` token layer and the (palette × mode) theming mechanism.
- **Deliverables:** copy kit tokens into `src/styles/tokens/{colors,typography,spacing,markdown}.css` + a `tokens.css` entry; **derive dark variants** for all four palettes (author `[data-theme][data-mode="dark"]` blocks — not supplied by the kit); rework `themeStore` to hold `{palette: teal|forest|gold|crimson, mode: light|dark|system}` and stamp `data-theme` + `data-mode` on `<html>`; a guidelines preview harness (port `guidelines/*.card.html`) to eyeball all 8 combinations.
- **Dependencies:** none (additive).
- **Risks:** dark variants must preserve the "accent does the work" feel without the kit's guidance — needs design judgment and contrast checks (WCAG AA on text/accent).
- **Acceptance:** switching palette and mode re-colors every token live; no raw hex outside token files; preview harness renders all four palettes in light and dark.

### Phase 2 — Typography + base
- **Goal:** Brand type and global base on tokens.
- **Deliverables:** load Nunito Sans (Avenir Next fallback) per typography.css; set `--mm-font-*`, editor 20px scale, chrome scale; apply to `:root`/base; reconcile `src/index.css` base rules to tokens (spacing/radii swapped for `--mm-space-*`/`--mm-radius-*`).
- **Dependencies:** Phase 1.
- **Risks:** Avenir Next is unlicensed for web — specimens fall back to Nunito Sans (documented caveat, acceptable).
- **Acceptance:** app renders in brand type; no hardcoded px spacing in restyled base rules; light + dark legible.

### Phase 3 — Notes library data model + persistence (backbone)
- **Goal:** Replace the single-doc model with a persisted multi-note library, preserving local-first files.
- **Deliverables:** `Note` type (id, title derived from first line/H1, body, tags, timestamps); extend `AppApi` with a library surface (`listNotes`, `readNote`, `createNote`, `writeNote`, `deleteNote`); implement per platform — **Electron:** a workspace folder of `.md` files via `fs`; **web:** File System Access directory handle with IndexedDB fallback; **iOS:** Capacitor Filesystem in Documents; new `notesStore` (Zustand) with `notes`, `activeNoteId`; migrate the existing single-file open/save into "import into library". Autosave active note.
- **Dependencies:** Phase 1 (for typing/structure only).
- **Risks:** persistence parity is the highest-risk item — web directory handles vs IndexedDB, iOS sandbox paths; migration for users with an open file; autosave/debounce correctness.
- **Acceptance:** create/list/edit/delete a note persists across reload on each platform; unit tests for `notesStore` + title/tag derivation; existing `AppApi` file ops still function as import/export.

### Phase 4 — Tag + search engine
- **Goal:** Bear-style tags and search over the library.
- **Deliverables:** parse `#hashtag` tokens from note bodies → tag index with counts; `selectedTag` filter + "All"; substring/token search over title+body; derived filtered/sorted list selector.
- **Dependencies:** Phase 3.
- **Risks:** tag-token parsing edge cases (code spans, URLs, `#` in headings must not become tags); performance at scale (defer indexing optimization).
- **Acceptance:** tags surface from content with correct counts; selecting a tag and typing in search both narrow the list; unit tests cover parsing exclusions and filtering.

### Phase 5 — Three-pane shell UI
- **Goal:** Build the workspace layout to match the mockup/screenshots.
- **Deliverables:** port kit components (`WindowDots`, `Tag`, `DocListItem`, `ThemeSwatch`, `MarkdownLine`) into `src/components/`; build `Sidebar` (dots, All pill, HASHTAGS, tag list), `DocList` (search + rows), `EditorChrome` (list icon, Aa, +, edit/read toggle); layout via `--mm-sidebar-w`/`--mm-list-w`/`--mm-topbar-h`; wire to `notesStore`; responsive collapse to a sidebar→list→editor stack on mobile/iOS (reuse existing mobile patterns).
- **Dependencies:** Phases 1–4.
- **Risks:** replacing the current toolbar/mode UI without regressing keyboard shortcuts, menu actions, and exports; mobile navigation of three panes.
- **Acceptance:** three-pane workspace renders per `ui_kits/mac-markdown/index.html` and screenshots across all four palettes + dark; sidebar/list/editor navigation works on desktop and mobile.

### Phase 6 — Structure-colored Markdown editor
- **Goal:** The core visual rule in both editing and reading.
- **Deliverables:** **edit mode** — a CodeMirror 6 decoration/theme that colors syntax markers (`#`, `-`, `1.`, `>`, checkboxes, table rules) in `--md-marker`/accent while prose stays `--mm-text`, replacing oneDark; **read mode** — map the react-markdown preview to the `--md-*` roles per `tokens/markdown.css` and the mockup; Aa font popover swaps the editor face and scales base size.
- **Dependencies:** Phases 1, 5.
- **Risks:** highest-effort phase — inline marker coloring in CM6 needs a custom decoration plugin; keeping edit and read renderings visually consistent.
- **Acceptance:** markers, hashes, checkboxes, quote bars, table rules render in accent and prose stays neutral, in both edit and read modes, across all themes; matches the specimen.

### Phase 7 — Theme + font switcher UX
- **Goal:** Reader-facing palette/mode/font controls with persistence.
- **Deliverables:** `ThemeSwatch` two-tone picker (palette + light/dark); Aa popover (curated system faces, size scale); persist `{palette, mode, font, size}` via `AppApi` settings on each platform.
- **Dependencies:** Phases 1, 2, 6.
- **Acceptance:** changing palette, mode, font, or size persists across reload on all three platforms.

### Phase 8 — Feedback round: export overhaul, save semantics, pane-collapse fix
- **Goal:** Address author feedback from live use (2026-07-05).
- **Deliverables:**
  - **Pane-collapse fix** (reported: "green Mac zoom button closes all sidebars") — root cause: the ≤640px mobile breakpoint fires on desktop window resize/zoom-restore; `listOpen` samples width only at mount and `.mm-sidebar` is unconditionally `display:none` when narrow. Fix: track the breakpoint with a matchMedia listener, restore panes when crossing back to wide, keep the sidebar reachable on narrow desktop widths.
  - **Export overhaul** — root cause of "export isn't working on web": web `exportPdf` is a bare `window.print()` (prints the app chrome, not the note) and HTML export doesn't exist. Add `exportHtml` to `AppApi` (all three shims) producing a standalone themed HTML document; rebuild web PDF export to print only the rendered note via a print-scoped document; export menu offers HTML + PDF (+ existing TXT/DOCX).
  - **Save semantics per platform** — web: Save persists to the library (flush autosave + saved feedback; no file dialog); iOS: save into the app Documents directory (backup/Files behavior documented), with a genuinely private on-device option surfaced in Settings (Phase 9).
- **Dependencies:** Phases 1–7.
- **Acceptance:** HTML + PDF export verified working on web; Save behaves per platform; window resize/zoom no longer strands the panes.

### Phase 9 — Settings screen
- **Goal:** A settings surface in the design language.
- **Deliverables:** gear entry point in the chrome → settings panel (same popover design language); **toolbar show/hide toggle** (persisted; hides the transitional toolbar); **iOS save-location option** (Documents/backup vs private on-device), persisted via AppApi settings with safe migration between `Directory.Documents` and `Directory.LibraryNoCloud` (issue #8 plan: `docs/W-000008-IMPLEMENTATION_PLAN.md`).
- **Dependencies:** Phase 8.
- **Acceptance:** toggles persist and apply live on all platforms.

### Phase 10 — Mobile editing kit: bottom bar + markdown keyboard accessory
- **Goal:** Bear-style mobile editing ergonomics (per author's iPad screenshots).
- **Deliverables:** bottom tool strip (share/export · Aa · +) on mobile/tablet; a **markdown keyboard accessory bar** shown above the on-screen keyboard while editing (#, bold, italic, list, task, quote, code, link, indent, Done) inserting at the CodeMirror cursor; visualViewport-aware positioning on iOS.
- **Dependencies:** Phases 5–8.
- **Acceptance:** verified on a narrow web viewport and the iOS build; accessory inserts correct markdown at the cursor.

### Phase 11 — Cross-platform verification, migration, cleanup
- **Goal:** Ship-ready parity and hygiene.
- **Deliverables:** verify library persistence + UI on web, Electron, iOS; keep file open/save/export as per-note import/export; remove dead v1 chrome; update `README.md` + `CLAUDE.md` for the new architecture; expand tests (notes store, tag parsing, theme switching) and keep the `webEntry` guard; re-verify Open/Save in real Safari.
- **Dependencies:** Phases 1–10.
- **Acceptance:** typecheck, lint, all Vitest tests, web + iOS builds, and Playwright e2e pass; Safari re-verified; screenshots match the design across all four themes + dark on all platforms.

## 5. Out-of-scope / deferred
- Nested tags (`#a/b`), note links/backlinks, pinned/archived notes.
- ~~Cloud sync, multi-device~~ — now its own track: [docs/passwordless-vault-sync.md](docs/passwordless-vault-sync.md) (issues #19–#21; Phase A crypto+sync engine landed). Collaboration and per-note lock remain out of scope.
- Image/file attachments, in-note media.
- Procuring a licensed Avenir Next webfont (stays on Nunito Sans fallback).
- Full-text index optimization for very large libraries.

## 6. Immediate next steps
1. Get sign-off on this phased plan and the dark-mode derivation approach (Phase 1 risk).
2. Copy the kit token files into `src/styles/tokens/` and stand up the guidelines preview harness (Phase 1).
3. Draft the dark-variant palettes for review before wiring `themeStore`.
