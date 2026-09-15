# Launcher integration validation — 2026-09

Issue #25 implementation evidence on 2026-09-14. Claims are limited to this
Arch/Omarchy host. The desktop template is shipped inside the ZIP; it was
**not** installed into `~/.local/share/applications`, and `xdg-mime default`
was not written.

## Source and host

| Item | Observed |
| --- | --- |
| Host | Linux 7.1.9-arch1-2 x86_64, `WAYLAND_DISPLAY=wayland-1` |
| User | ordinary `andysolomon` (UID 1000) |
| Bun / Electron | 1.4.2 / 44.3.0 |
| `xdg-mime query default text/markdown` | `omawrite.desktop` (unchanged) |
| `xdg-mime query default text/x-markdown` | `omawrite.desktop` (unchanged) |

## Artifact

`ELECTRON_ZIP_DIR` cache path from #23; `bun run make:linux` succeeded.

| Property | Observed |
| --- | --- |
| ZIP | `out/make/zip/linux/x64/Mac Markdown Workspace-linux-x64-1.0.0.zip` |
| SHA-256 | `c308e0f0d4aced30e34793f8c0d13e93bdab41077f6e85cccf9f8f7b9566cb5d` |
| Executable | `Mac Markdown Workspace-linux-x64/mac-markdown-workspace` (mode 755) |
| Launcher payload | `resources/linux/mac-markdown-workspace.desktop` + `resources/linux/icon.png` (512×512 RGBA) |

`desktop-file-validate packaging/linux/mac-markdown-workspace.desktop` exit 0
(hint only: TextEditor may be extended with Utility). No `x-scheme-handler`.

## Automated checks

| Check | Result |
| --- | --- |
| `bun run typecheck` | passed |
| `bun run lint` | passed (pre-existing warning in `src/ios/capacitorApi.ts`) |
| `bun run test` | new `argvParser` (8) + `hostOpenFilesQueue` (5) passed; suite 221/223 — 2 pre-existing `iosNotesStorage` failures also fail on clean HEAD |
| `bun run test:e2e` | 9 passed, including `e2e/launcher-integration.spec.ts` (cold single, multi with spaces/Unicode/leading-dash, second-instance import, missing-file toast) |

## Packaged Wayland smoke (isolated HOME)

Unpacked executable, no `--no-sandbox`. Isolated `HOME` + `--user-data-dir`.

- Cold multi-file (`solo.md`, `file with spaces.md`, `日本語.md`, `-- -leading.md`): library gained welcome + those four titles.
- Missing `nope.md`: only the welcome note; no extra file written.
- Second process with `--user-data-dir` matching a running instance: imported `# Wayland Second Instance` into that library.

Expected harmless Wayland/Vulkan stderr line from Electron 44.

## Not claimed here

- Installing the `.desktop` into the Omarchy launcher / icon theme (#24).
- File-manager "Open With" against a system-installed MIME default.
- macOS Finder `open-file` on a Darwin host.
