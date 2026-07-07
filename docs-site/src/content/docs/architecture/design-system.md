---
title: Design system — tokens, theme, surfaces
description: Structure-colored Markdown across four palettes and light/dark, resolved from CSS custom properties.
---

The design system's one rule: **structure is colored, prose is not.** Heading
hashes, list bullets, checkboxes, quote bars, and link brackets render in the
active theme's accent — in *both* the editor and the read views — while the words
themselves stay neutral and readable.

## Tokens → theme → surfaces

- **Tokens** (`src/styles/tokens/`) are plain CSS custom properties: colors,
  typography, spacing, and Markdown role colors, plus derived dark variants.
  Four palettes (teal / forest / gold / crimson) × light/dark are selected with
  `data-theme` and `data-mode` **on `<html>`** — the `--md-*` Markdown roles
  resolve at `:root`, so theming a subtree would silently break them.
- **`themeStore`** holds `{ palette, mode, resolvedMode, font, size }` and stamps
  the attributes plus `--mm-font-editor` / `--mm-editor-size`. The Aa popover and
  settings persist through `AppApi` settings keys.
- **Editor** (`markdownEditorTheme.ts`) is a CodeMirror `HighlightStyle`. All
  Lezer Markdown structural marks share one `processingInstruction` rule that
  paints them `--md-marker`; prose stays neutral and bold is carried by weight,
  not color. Because every value is a CSS variable, switching palette restyles the
  editor live with no extension rebuild.
- **Read modes** (`.preview` / `.wysiwyg-body`) map to the same `--md-*` roles, so
  edit and read stay visually consistent.

## A gotcha worth remembering

Duplicate `@codemirror/language` instances make `syntaxHighlighting()` silently
no-op — the highlight facet splits and neither copy wins. It's guarded by
`resolve.dedupe` in all three Vite configs plus `package.json` overrides. If
editor highlighting ever vanishes while the surrounding chrome still themes
correctly, suspect a nested CodeMirror copy first.
