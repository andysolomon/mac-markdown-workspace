# Private Arch install — Mac Markdown Workspace

> Private workflow for the PKGBUILD in `packaging/arch/`. This guide is
> **only** for authenticated members of the repository
> [`andysolomon/mac-markdown-workspace`](https://github.com/andysolomon/mac-markdown-workspace).
> Public AUR publication is a separate, future decision — the Omarchy
> *Install ▸ AUR* path will only work after that happens.

## What this package contains

The package `mac-markdown-workspace` bundles the Linux Electron x64
artifact (built by `bun run make:linux`) under
`/opt/mac-markdown-workspace/`. The native system libraries Electron needs
at runtime (`glib2`, GTK 3, NSS, ALSA, Wayland, …) are **not** bundled —
they are pulled from the Omarchy / Arch repos and updated by the system.

```
/usr/bin/mac-markdown-workspace                 # symlink → /opt/.../mac-markdown-workspace
/usr/share/applications/mac-markdown-workspace.desktop
/usr/share/icons/hicolor/{512x512,scalable}/apps/mac-markdown-workspace.{png,svg}
/usr/share/licenses/mac-markdown-workspace/{LICENSE, LICENSE.application, LICENSES.chromium.html}
/opt/mac-markdown-workspace/                    # bundled Electron 44.3.0 + renderer
```

The packaged app's appdata lives next to the executable (as Electron
expects) so that the Chrome sandbox helper (`chrome-sandbox`, mode
`4755`) is always at the path `argv0.dirname + "/chrome-sandbox"`.

> **Why bundled Electron and not the `electron` package?**
>
> | Tradeoff | Bundled (this package) | Arch `electron` package |
> | --- | --- | --- |
> | Chromium/Vulkan patches | Tied to Electron 44.3.0 release; can lag CVE rollups | Tracks Arch stable/RC cycle |
> | Disk size | +~125 MB | smaller on-disk |
> | Launcher behaviour on Hyprland/Wayland | Validated with sandboxed offline launch in #23 | Not validated in this repo |
> | Kernel unprivileged-userns reliance | Already proven for Omarchy 4.x | Same requirement |
> | Disable macOS-themed chrome toggle | Yes | Yes (depends on Electron version) |

If/when the `electron` Arch version catches up to the dependency baseline
this package was validated against, switching is a one-line change in
`PKGBUILD`'s `depends` and a `makepkg -si` rebuild.

## One-time host setup

```sh
sudo pacman -S --needed namcap base-devel git
gh auth login                                                # choose HTTPS + repo scope
```

`namcap` is needed to lint the recipe and built package; `base-devel`
brings `makepkg` and the `fakeroot` helper. If you already ran
`packaging/linux/build` before, you do not need anything else.

## Cut a private release (operator)

When `package.json` version bumps to `X.Y.Z`, the operator runs:

```sh
./packaging/arch/release.sh X.Y.Z
```

This:

1. Runs `bun run make:linux` to rebuild the Linux Electron x64 ZIP.
2. Refuses to publish if the freshly-built ZIP SHA-256 doesn't match the
   one already locked into `PKGBUILD` (forces a deliberate PKGBUILD bump).
3. Creates the `vX.Y.Z` tag in the private repo if missing and uploads the
   renamed ZIP plus a `SHA256SUMS` manifest.

The release URL is then fixed at
`https://github.com/andysolomon/mac-markdown-workspace/releases/download/vX.Y.Z/mac-markdown-workspace-X.Y.Z-linux-x64.zip`,
which `build.sh` downloads with `gh auth`.

## Build & install the package locally

After a release exists for your tag:

```sh
./packaging/arch/build.sh --install        # downloads, verifies, makepkg -si
```

`build.sh` does the following behind the scenes:

1. Confirms `gh auth status` is good.
2. Downloads the artifact from the private release.
3. Verifies SHA-256 against the value committed in `PKGBUILD`.
4. Stages a clean `makepkg` build directory under `/tmp`.
5. Calls `makepkg -si --nocheck` (syncs makedepends, skips optdepends).

The resulting `mac-markdown-workspace-X.Y.Z-x86_64.pkg.tar.zst` lands in
`/tmp/macmd-pkgbuild-XXXXXX/build/` and is installed into the active pacman
database.

### Round-trip upgrade

```sh
./packaging/arch/build.sh --install       # install v1.0.0
… time passes …
./packaging/arch/build.sh --install       # install v1.1.0 over v1.0.0
pacman -Qii mac-markdown-workspace         # install date bumped, no reinstall dropped
```

Notes live in `~/Documents/Mac Markdown` (Electron's `appData` dir is also
left alone; both are owned by the user, not by pacman). They survive
upgrade untouched.

### Removal

```sh
sudo pacman -Rns mac-markdown-workspace
```

This deletes everything under `/opt/mac-markdown-workspace`, the
`/usr/bin/mac-markdown-workspace` symlink, the `usr/share` pieces, and
the license bundle — **without** touching your notes in
`~/Documents/Mac Markdown`.

## What this workflow is **not**

- **Not** the Omarchy *Install ▸ AUR* path. AUR helpers (paru, yay) look
  for a recipe in `https://aur.archlinux.org/` and **only** that URL. The
  PKGBUILD in this repo is private; it is therefore not visible to AUR.
  Trying `omarchy install aur/mac-markdown-workspace` will fail with a
  `package not found`. Public AUR publication is a future distribution
  decision that requires an anonymously accessible source/artifact URL —
  it is **not** part of this implementation.
- **Not** signed. There's no GPG signature on the artifact or the package
  yet — operators verify the SHA-256 against the committed PKGBUILD and
  the GitHub release publisher. A maintainer signature can be added by
  setting `GPGKEY=` in `~/.makepkg.conf`; it is intentionally out of scope
  for the initial private build.

## Troubleshooting

- `build.sh: gh is not authenticated` → `gh auth login` first.
- `build.sh: sha256 mismatch` → re-run with `--refresh` after a private
  release is cut by `./packaging/arch/release.sh X.Y.Z`. This is the
  normal flow after a version bump.
- `pacman -U` fails with `signature` errors → install with
  `pacman -U --config <(printf '[options]\nSigLevel = Never\n')` for the
  first install only, then re-add your real config.
- `chrome-sandbox` cannot be setuid-root on noexec `/tmp` mounts: this
  package installs it under `/opt` which is mounted normally on Omarchy;
  nothing extra to do.
