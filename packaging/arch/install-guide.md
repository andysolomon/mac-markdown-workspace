# Install — Mac Markdown Workspace (Arch / Omarchy)

Public install guide for `mac-markdown-workspace` on Arch Linux and Omarchy.
The package ships the Linux x86_64 Electron build under
`/opt/mac-markdown-workspace/`. Native system libraries (glib2, GTK 3, NSS,
ALSA, Wayland, …) come from the Arch repos and are updated by the system.

```
/usr/bin/mac-markdown-workspace                          # symlink → /opt/.../mac-markdown-workspace
/usr/share/applications/mac-markdown-workspace.desktop
/usr/share/icons/hicolor/{512x512,scalable}/apps/mac-markdown-workspace.{png,svg}
/usr/share/licenses/mac-markdown-workspace/{LICENSE, LICENSE.application, LICENSES.chromium.html}
/opt/mac-markdown-workspace/                             # bundled Electron 44.3.0 + renderer
```

> The packaged app's data lives next to the executable (as Electron expects)
> so the Chrome sandbox helper (`chrome-sandbox`, mode `4755`) is always at
> the path `argv0.dirname + "/chrome-sandbox"`.

## Install via AUR (recommended)

The package is published to the AUR as [`mac-markdown-workspace`][aur].

```sh
# AUR helper (Omarchy's installer uses one of these)
yay -S mac-markdown-workspace
# or, via the Omarchy package installer:
#   Install ▸ AUR  →  mac-markdown-workspace

# Manual with a helper
paru -S mac-markdown-workspace
```

## Install from the local PKGBUILD

Useful when you want to pin to an unreleased commit or skip AUR.

```sh
git clone https://github.com/andysolomon/mac-markdown-workspace.git
cd mac-markdown-workspace/packaging/arch
makepkg -si        # build + install + sync deps
```

`makepkg -si` resolves runtime dependencies from the Arch repos and the
Linux x86_64 ZIP from the public GitHub release tagged `v1.0.0`.

## What gets installed

| Path | Purpose |
|------|---------|
| `/opt/mac-markdown-workspace/` | self-contained Electron 44.3.0 + renderer + ASAR |
| `/usr/bin/mac-markdown-workspace` | symlink to the binary |
| `/usr/share/applications/mac-markdown-workspace.desktop` | launcher entry with Markdown MIME types |
| `/usr/share/icons/hicolor/512x512/apps/mac-markdown-workspace.png` | launcher icon |
| `/usr/share/icons/hicolor/scalable/apps/mac-markdown-workspace.svg` | vector icon |
| `/usr/share/licenses/mac-markdown-workspace/LICENSE` | MIT (Andrew Solomon) |
| `/usr/share/licenses/mac-markdown-workspace/LICENSE.application` | bundled app license |
| `/usr/share/licenses/mac-markdown-workspace/LICENSES.chromium.html` | Electron / Chromium notices |

## Sandbox

The renderer runs with `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, ASAR-only loading, and the Electron fuses in
`forge.config.ts`. `--no-sandbox` is never used and must not be added to
launchers.

The package installs `chrome-sandbox` setuid-root under `/opt`, so the
sandbox helper works without `CONFIG_USER_NS=y` on the kernel. If user
namespaces are enabled (Arch default), Chromium uses those instead — both
paths are validated end-to-end on Omarchy.

## Runtime notes

- Notes are written to `~/Documents/Mac Markdown/<id>.md` on a default
  Omarchy install. If `XDG_DOCUMENTS_DIR` is unset, Electron 44 falls
  back to `$HOME`, so the library appears at `$HOME/Mac Markdown`. Either
  way it is owned by the user and survives upgrades untouched.
- Wayland is auto-selected by Electron 44 on this host. A single
  `--ozone-platform=wayland is not compatible with Vulkan` line on stderr
  is expected and harmless (Vulkan is disabled).
- Single-instance opening: launching `mac-markdown-workspace file.md`
  while the app is already running forwards the path to the existing
  instance instead of opening a second window.

## Round-trip upgrade

```sh
yay -Syu mac-markdown-workspace      # upgrade alongside other AUR/system packages
pacman -Qii mac-markdown-workspace   # install date bumped, no reinstall dropped
```

Notes in `~/Documents/Mac Markdown` are owned by the user, not by pacman,
and survive upgrade untouched.

## Removal

```sh
sudo pacman -Rns mac-markdown-workspace
```

This deletes everything under `/opt/mac-markdown-workspace`, the
`/usr/bin/mac-markdown-workspace` symlink, the `usr/share` pieces, and the
license bundle — **without** touching your notes in
`~/Documents/Mac Markdown`.

## Troubleshooting

- `pacman -U` fails with `signature` errors → install with
  `pacman -U --config <(printf '[options]\nSigLevel = Never\n')` for the
  first install only, then re-add your real config.
- App fails with "SUID sandbox helper binary" / "No usable sandbox" → the
  installed `/opt/mac-markdown-workspace/chrome-sandbox` should be setuid
  (mode `4755`). Reinstall with `pacman -S --overwrite '*' mac-markdown-workspace`
  if the mode is wrong.
- App fails to find native libraries → confirm the runtime `depends` list
  in `PKGBUILD` is satisfied: `pacman -Qqe | grep -E '^(glib2|gtk3|nss|alsa-lib|wayland)$'`.

[aur]: https://aur.archlinux.org/packages/mac-markdown-workspace
