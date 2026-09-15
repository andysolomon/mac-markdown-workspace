# Issue #26 — Hyprland menus, shortcuts, and responsive layout

**Story:** [#26](https://github.com/andysolomon/mac-markdown-workspace/issues/26) — Adapt desktop menus, shortcuts and responsive layout for Hyprland  
**Branch:** `feat/issue-26-hyprland-desktop` (parent-owned ship)

## 1. Product goal and scope boundaries

Omarchy/Hyprland users get Linux-appropriate menus and Ctrl shortcuts, no misleading decorative traffic lights, a window that tiles at half-width, and native Export menu items that share the toolbar's `exportDocument` path. macOS Cmd shortcuts and native app-menu conventions stay intact. Native Wayland is validated rather than forced onto X11 via legacy Ozone flags.

In scope:

- Additive `AppApi.platform` (`HostPlatformInfo`) on Electron / web / iOS shims.
- `BrowserWindow` min size lowered to 640×480.
- Darwin-only Services/Hide/front roles; Linux File menu carries Quit.
- Platform-aware command modifier; Shift+letter chords via `toLowerCase`.
- Menu `export-*` → statically imported `exportDocument`.
- Hide `WindowDots` when `platform.showWindowDots` is false.
- Unit + Playwright coverage; operator docs + dated Wayland validation record.

Out of scope:

- PKGBUILD / `xdg-mime` defaults (#24).
- CI / support guide (#29).
- Forcing `--ozone-platform=x11` globally.
- Changing Mac design tokens; only gating decorative chrome.

## 2. Current baseline

- #23/#25 ship Linux ZIP + launcher/MIME/single-instance.
- `minWidth: 980` blocked half-tiles on 1920 displays.
- `useKeyboardShortcuts` treated Meta|Control as mod and compared `e.key` literally (Shift+S → `"S"`).
- Menu emitted `export-txt|pdf|docx` but the renderer never handled them.
- `WindowDots` always rendered in `Sidebar`.

## 3. Missing capabilities

| Capability | Gap | Planned outcome |
| --- | --- | --- |
| Half-tile window | minWidth 980 | 640×480 mins |
| Linux menus | macOS roles unconditional | Darwin-gated roles |
| Shortcuts | Meta steals Super; Shift+S broken | Ctrl-only on Linux; normalize key |
| Export menu | dead actions | `exportDocument` path |
| WindowDots | always shown | gated via `platform` |
| Wayland evidence | none | dated validation doc |

## 4. Milestones and phases

### Phase 1 — Platform metadata

**Deliverables:** `hostPlatform.ts`, `AppApi.platform` on all three shims.

### Phase 2 — Main process

**Deliverables:** lower mins; `buildAppMenu` darwin gate; Export as HTML parity item.

### Phase 3 — Renderer

**Deliverables:** `useKeyboardShortcuts` + `Sidebar` WindowDots gate.

### Phase 4 — Evidence

**Deliverables:** `hostPlatform.test.ts`, `e2e/hyprland-desktop.spec.ts`, `docs/hyprland-desktop.md`, `docs/hyprland-desktop-validation-2026-09.md`.

## 5. Immediate next steps

Independent Verify, parent-owned PR with `Closes #26`, archive plan/progress on merge.
