# Arch PKGBUILD validation — Sep 2026

Validation evidence for the private `packaging/arch/PKGBUILD` recipe
delivered in issue #24. Recorded on Omarchy/Arch x86_64. Operator-only
gates (sudo-required installs) are explicitly listed under
"Operator actions".

## Build environment

| Item | Value |
| --- | --- |
| Host | `Linux quattro 7.2.3-arch1-3 #1 SMP PREEMPT_DYNAMIC … x86_64` |
| Distribution | `Omarchy 4.0.3` (`ID=omarchy`, `ID_LIKE=arch`) |
| makepkg | `7.1.0` (`/usr/bin/makepkg`) |
| pacman | `man-db` + `libalpm 18.x` (system default) |
| `bun` | `1.4.2` (matches `package.json` `packageManager`) |
| `gh` | authenticated as `andysolomon` (keyring), `repo` scope |
| `sha256sum` | coreutils 9.x default |

`namcap` is **not** installed by default on Omarchy → operator must run
`sudo pacman -S namcap` once before final approver sign-off.

## Recipe validation

```sh
$ makepkg --printsrcinfo > .SRCINFO   # exits 0
```

The committed `packaging/arch/.SRCINFO` is byte-for-byte equivalent to the
freshly-printed output for the same `PKGBUILD` (verified by running
`makepkg --printsrcinfo` into a tmp dir and diffing).

## Local-source SHA-256

> The SHA-256 of the upstream ZIP varies per `bun run make:linux` run
> because Electron embeds current-second timestamps. After every
> `make:linux`, the PKGBUILD’s `sha256sums` line must be refreshed.
> `./packaging/arch/build.sh --refresh` does this automatically and
> is exactly what `release.sh` will refuse-to-publish against.

```sh
$ sha256sum 'out/make/zip/linux/x64/Mac Markdown Workspace-linux-x64-1.0.0.zip'
17980b1614dba1e5f3be536e7f6e4072528641ccf8fa95f9d75f2c161618fe2f  ...
```

The same value appears in `PKGBUILD` (`sha256sums=`) and
`packaging/arch/.SRCINFO`. `makepkg` validates the staged copy during
build:

```
==> Validating source files with sha256sums...
    mac-markdown-workspace-1.0.0-1-x86_64.zip ... Passed
```

## Build (no install)

```sh
$ makepkg -f --nocheck --nodeps
==> Making package: mac-markdown-workspace 1.0.0-1 (Tue 15 Sep 2026 04:41:47 PM EDT)
==> Retrieving sources...  -> Found mac-markdown-workspace-1.0.0-linux-x64.zip
==> Validating source files with sha256sums... Passed
==> Extracting sources...  -> Extracting … with bsdtar
==> Entering fakeroot environment...
==> Starting package()...
==> Creating package "mac-markdown-workspace"...
…
==> Finished making: mac-markdown-workspace 1.0.0-1 (… PM EDT)
```

Result: `mac-markdown-workspace-1.0.0-1-x86_64.pkg.tar.zst` (117 MB,
333 MB uncompressed). Top of file listing:

```
mac-markdown-workspace /                                       # tracked by pacman
mac-markdown-workspace /opt/                                   # owner root, mode 755
mac-markdown-workspace /opt/mac-markdown-workspace/            # app bundle
mac-markdown-workspace /opt/mac-markdown-workspace/chrome-sandbox
-rwsr-xr-x root/root 15232   opt/.../chrome-sandbox            # setuid-bit holds
mac-markdown-workspace /opt/.../mac-markdown-workspace         # main executable
mac-markdown-workspace /opt/.../LICENSES.chromium.html
mac-markdown-workspace /usr/bin/mac-markdown-workspace -> /opt/.../mac-markdown-workspace
mac-markdown-workspace /usr/share/applications/mac-markdown-workspace.desktop
mac-markdown-workspace /usr/share/icons/hicolor/512x512/apps/mac-markdown-workspace.png
mac-markdown-workspace /usr/share/icons/hicolor/scalable/apps/mac-markdown-workspace.svg
mac-markdown-workspace /usr/share/licenses/mac-markdown-workspace/LICENSE
mac-markdown-workspace /usr/share/licenses/.../LICENSE.application
mac-markdown-workspace /usr/share/licenses/.../LICENSES.chromium.html
```

107 entries total — every file owned by `root/root` so pacman can manage
them.

## Runtime dependency presence on Omarchy 4.0.3

All 30 `depends` entries are already installed on the Omarchy image used
for validation (verified with `pacman -Q <pkg>` for each):

```
OK alsa-lib          OK at-spi2-core      OK cairo             OK dbus
OK expat             OK gcc-libs          OK glib2             OK gtk3
OK hicolor-icon-theme OK libcups          OK libdrm            OK libnotify
OK libsecret         OK libx11            OK libxcb            OK libxcomposite
OK libxdamage        OK libxext           OK libxfixes         OK libxkbcommon
OK libxkbcommon-x11  OK libxrandr         OK libxrender        OK libxss
OK libxtst           OK mesa              OK nspr              OK nss
OK pango             OK wayland
```

Optional packages already present: `pipewire-pulse`, `libpulse`.
Optional packages missing on this image (not blockers): `libappindicator-gtk3`
(missing → StatusNotifierItem falls back to X11; the desktop still
launches the editor window).

## `.PKGINFO` (excerpt)

```
pkgname = mac-markdown-workspace
pkgver = 1.0.0-1
pkgdesc = Local-first Markdown notes workspace (private x86_64 build)
url = https://github.com/andysolomon/mac-markdown-workspace
license = MIT
conflict = mac-markdown-workspace-bin
provides = mac-markdown-workspace
size = 333825848
arch = x86_64
depend = alsa-lib
… (30 depends total) …
```

`packager` is recorded as `Unknown Packager` because the build was run
as a non-root user. Operators wanting a personalised packager can set
`PACKAGER="Andrew Solomon <andrewsolomon.edu at gmail.com>"` in
`~/.makepkg.conf`.

## Operator actions (required before PR sign-off)

These steps require `sudo` and so were not run inside the parent session.
Each is reproducible by re-running the build above and pasting the
output into this file:

1. **Linting.** `sudo pacman -S namcap && namcap mac-markdown-workspace-1.0.0-1-x86_64.pkg.tar.zst &&
   namcap PKGBUILD`. Resolve every warning; if any are deliberately
   kept (e.g., `makedepends-not-needed-by-package`), document them.
2. **Live install.** `sudo pacman -U --noconfirm mac-markdown-workspace-1.0.0-1-x86_64.pkg.tar.zst`
   and confirm `/usr/bin/mac-markdown-workspace --version` runs.
3. **Upgrade test.** Repeat step 2 with a deliberately-different
   `pkgrel`, confirm the previous version is replaced atomically.
4. **Round-trip notes.** Create a dummy note via the launcher, then
   `pacman -Rns mac-markdown-workspace` and verify the note still
   exists in `~/Documents/Mac Markdown`.
5. **Documented failures.** Anything still outstanding after step 4
   becomes a follow-up issue before the PR is approved.

## What we explicitly do **not** claim here

- ARM64 packages (Arch ARM naming varies and is not in scope for this
  issue; `arch=('x86_64')` makes this explicit).
- Public AUR publication (issue text: separate future decision).
- Maintainer GPG signature (`PACKAGER` and `GPGKEY` left as future
  hardening).

## Sign-off readiness

The recipe, scripts, and helper docs are in place; the only remaining
gate before opening the PR is **operator action item 1** (namcap run) +
**2–4** (live install/upgrade/removal smoke). The archive chore for
#25 / #26 will follow the same shape as this issue's plan.
