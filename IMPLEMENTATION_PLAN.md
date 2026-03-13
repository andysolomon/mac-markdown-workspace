# Mac Markdown Workspace - Implementation Plan

## Objective
Build a macOS-first local Markdown workspace with source editing, rich preview, themes, and export support.

## Phase Plan
- Phase 1: Shell + security baseline (Electron main/preload/renderer boundaries)
- Phase 2: Source editor (CodeMirror 6) + Markdown preview pipeline
- Phase 3: Theme system + status/counters + keyboard shortcuts
- Phase 4: File operations + exports (TXT/PDF/DOCX)
- Phase 5: Editable preview (Milkdown) and source synchronization strategy
- Phase 6: Packaging, QA, and release hardening for macOS

## Current Scaffold State
- Electron Forge + Vite + React baseline wired
- Preload contextBridge API for local file operations
- Starter source/split/WYSIWYG mode switch shell
- Markdown preview baseline with GFM, emoji, and KaTeX math
- Bun package workflow enabled

## Architecture Notes
- Main process owns all file system and dialog access.
- Preload provides typed, minimal API surface.
- Renderer is UI-only and untrusted.
- Document state will become centralized in a Zustand store.
