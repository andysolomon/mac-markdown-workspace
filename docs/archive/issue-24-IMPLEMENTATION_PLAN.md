# Issue #24 — Arch PKGBUILD and private install / upgrade workflow

## Outcome
A private Arch x86_64 package reproducibly built from the tested Linux
artifact, installed/upgraded/removed through pacman without losing user
data, and documented separately from future public AUR distribution.

## Scope
- `packaging/arch/PKGBUILD` and regenerated `.SRCINFO`
- `packaging/arch/build.sh` — authenticated download via `gh release download`,
  SHA-256 verification, then `makepkg -si`.
- `packaging/arch/release.sh` — publishes the Linux Electron ZIP from
  `out/make/zip/linux/x64/` to a private GitHub release, with a manifest of
  SHA-256 sums. Read by **the operator** when cutting a release; never
  invoked from CI in this implementation.
- `packaging/arch/install-guide.md` — operator-facing private install guide
  that distinguishes local pacman workflow from Omarchy *Install ▸ AUR*.
- Docs: `docs/arch-pkgbuild.md` (overview), `docs/arch-pkgbuild-validation-2026-09.md`
  (recorded evidence), `docs/issue-24-IMPLEMENTATION_PLAN.md` (this file),
  `docs/issue-24-progress.txt` (tracker).

## Runtime strategy
- **Bundle** the Electron 44.3.0 runtime from the Linux x64 ZIP under
  `/opt/mac-markdown-workspace/`. This was validated in #23 with sandboxed,
  offline launcher launch and reproducible smudged builds.
- Package does **not** depend on the Arch-repo `electron` package. Tradeoffs
  (Chromium GPU/Vulkan ships with the bundle, exact version pinning, no
  AppImage override, dependency surface ~125MB larger) are documented in
  `install-guide.md`.
- Non-bundled runtime deps (`glib2`, GTK3, X libs, NSS, ALSA, Wayland) stay
  as native Arch packages so security patches reach the binary.

## Acceptance criteria mapping
| AC | Mechanism |
| --- | --- |
| Clean Arch x86_64 build → pacman install → launcher starts without the source checkout | PKGBUILD + `build.sh`; `Exec=mac-markdown-workspace %F` from the .desktop |
| Upgrade preserves notes/settings/identity | Package files live under `/opt/mac-markdown-workspace`, `/usr/bin`, `/usr/share/{applications,icons,licenses}`; user data stays in `~/Documents/Mac Markdown` |
| `pacman -Rns` removes app files, preserves user data | pacman tracks only package-owned files; the install hooks do not touch `~/Documents/Mac Markdown` |
| namcap findings resolved or documented | Run after install guide is drafted; install dependencies pulled from namcap output |
| Local install distinguished from Omarchy AUR | `install-guide.md` has explicit "Private local package (this build)" vs "Omarchy Install ▸ AUR (future public publication)" sections |

## Verification
- `makepkg -g` regenerates `.SRCINFO` against the staged source.
- `makepkg --printsrcinfo` after `updpkgsums` produces a committed `.SRCINFO`
  that matches `PKGBUILD`.
- `namcap PKGBUILD` and `namcap *.pkg.tar.zst` (operator installs `namcap`
  via `pacman -S namcap`).
- Disposable install with `pacman -U --noconfirm` against a temp `LDIR` so
  existing pacman db is untouched.
- Round-trip upgrade (`pacman -U pkg-1.pkg.tar.zst` then `pkg-2.pkg.tar.zst`)
  preserves `~/Documents/Mac Markdown`.
- `pacman -Rns` confirms application files are removed while user data and
  the untracked `~/.local/share/mac-markdown-workspace/notes` (created by
  Electron) are untouched.

## Out of scope
- Publishing the package to AUR (decision deferred per issue: AUR publication
  requires public source/artifacts).
- CI integration — belongs to #29.
- macOS host validation of the .desktop/icon — Linux-only check here.
- ARM64 — explicitly not claimed in the package metadata.
