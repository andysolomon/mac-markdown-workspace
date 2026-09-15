# Hyprland desktop validation — 2026-09

Dated Omarchy/Wayland record for issue #26. Complements automated unit +
Playwright coverage; does **not** force `--ozone-platform=x11`.

## Host

| Field | Value |
| --- | --- |
| Date (UTC) | 2026-09-15T16:05:05Z |
| Kernel | 7.2.3-arch1-3 |
| Session | `XDG_SESSION_TYPE=wayland`, `WAYLAND_DISPLAY=wayland-1` |
| Desktop | Hyprland |
| Base commit | `bca51df` (pre-merge working tree for #26) |

## Automated gates (this change)

| Check | Result |
| --- | --- |
| `bun run typecheck` | clean |
| `bun run lint` | 0 errors (pre-existing `capacitorApi` unused-var warning only) |
| `bun run test` | 231/231 (incl. 8 `hostPlatform` cases) |
| `bun run test:e2e` | 10/10 with `workers: 1` (incl. hyprland-desktop) |
| Window `getMinimumSize()` ≤ 640×480 | asserted in e2e |
| Linux `platform.showWindowDots === false` | asserted in e2e when `os === "linux"` |

## Manual Wayland checklist (native)

Run the Linux ZIP or `bun start` under native Wayland (**no** forced Ozone X11 flag).

| Area | Native Wayland | Notes |
| --- | --- | --- |
| Focus / activate tiled half-width | [x] | Automated: `setSize(800,600)` succeeds with mins 640×480 |
| Clipboard copy/paste in editor | [ ] | Operator host |
| Drag/drop Markdown into window | [ ] | Imports via #25 path if applicable |
| File open/save dialogs | [ ] | Portal / native dialog |
| Continuous resize / snap | [x] | e2e pins 1320 then 800; chrome remains reachable |
| IME / dead-key entry | [ ] | Operator host |
| Font rendering | [ ] | Operator host |

## XWayland fallback (only if native fails)

| Area | XWayland | Notes |
| --- | --- | --- |
| Launch with `ELECTRON_OZONE_PLATFORM_HINT=x11` (per-session, not packaged default) | [ ] | Not required on this host |
| Same checklist as above | [ ] | |

## Explicit non-goals

- Do **not** bake `--ozone-platform=x11` into the packaged executable or `.desktop`.
- Do **not** change `xdg-mime` defaults (owned by #24).

## Sign-off

Automated gates green on Hyprland/Wayland host. Remaining manual rows
(clipboard, drag/drop, dialogs, IME, fonts) are operator smoke items and may
be completed against the PR preview ZIP.
