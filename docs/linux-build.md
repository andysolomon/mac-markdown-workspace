# Linux build guide (x86_64 Electron ZIP)

This is the reproducible build contract for the portable Linux artifact
(issue #23). It covers only the **Linux x86_64 ZIP**. Arch packaging
(`PKGBUILD`, #24), launcher/MIME integration (#25), Hyprland integration
(#26), and CI (#29) build on top of this contract and are documented
separately when they land.

Observed September 2026 build and host-validation evidence is recorded in
[`linux-build-validation-2026-09.md`](./linux-build-validation-2026-09.md).

## Toolchain pins

| Component        | Pin / source                                        |
|------------------|-----------------------------------------------------|
| Bun              | `1.4.2` (`package.json` → `packageManager`)         |
| Electron         | `44.3.0` exact (`devDependencies.electron`)         |
| Electron Forge   | `@electron-forge/*` `^7.11.1` (resolved via `bun.lock`) |
| Electron Packager| `@electron/packager` `18.4.4` (transitive)          |
| Node.js          | `>=22.12.0` (`package.json` → `engines.node`); validated on `v26.7.0` |
| Architecture     | `x86_64` only. ARM64 is not built or validated.     |

Notes on the pins:

- Electron 44's npm package no longer ships a `postinstall` hook. The binary is
  fetched by the root `postinstall` script (`install-electron`, Electron's own
  installer bin), which `bun install` runs automatically. `trustedDependencies`
  also lists `electron` so any future lifecycle script Electron adds is allowed.
- `overrides.yauzl` is pinned to `3.4.0`. Electron Packager extracts the
  Electron distribution with `extract-zip@2`, whose `yauzl@2` dependency never
  resolves on Node 24+/26 (the process exits silently during "Finalizing
  package" and no `out/` directory appears). yauzl 3 is API-compatible and
  fixes the extraction.
- A frozen install must not rewrite `bun.lock`. If it does, the lockfile and
  `package.json` have drifted and the build is not reproducible.

## Prerequisites (Arch / Omarchy)

- `bun` 1.4.2 (`mise use bun@1.4.2` or the Arch package).
- `nodejs` **22.12.0 or newer** (Electron 44's installer declares
  `engines.node: ">=22.12.0"`). Forge and Packager run under Node — Bun
  executes the scripts, but the `electron-forge` CLI has a `node` shebang —
  and its bundled `npm` command. Forge 7 does not identify Bun as a supported
  package manager, so `make:linux` supplies Forge with the installed npm
  version only for its compatibility preflight; dependency installation
  remains pinned to Bun.
- `zip` is required: Forge's ZIP maker uses `cross-zip`, which shells out to
  the system `zip` command on Linux. `unzip` is optional but useful for the
  inspection and launch commands below.
- No `dpkg`, `rpmbuild`, `fakeroot`, or macOS tooling. The Linux command below
  selects **only** the ZIP maker; the DEB/RPM/Squirrel makers stay configured
  for their own platforms and are never invoked.
- Network access on the first build to download the Electron 44.3.0 Linux
  distribution (cached afterwards in `~/.cache/electron/`).

## Build from a clean checkout

```bash
git clone https://github.com/andysolomon/mac-markdown-workspace.git
cd mac-markdown-workspace
bun install --frozen-lockfile        # also downloads the Electron 44.3.0 binary
cat node_modules/electron/dist/version   # → 44.3.0
bun run make:linux                   # electron-forge make --platform linux --arch x64 --targets @electron-forge/maker-zip
```

For a network-isolated repeat build, `ELECTRON_ZIP_DIR` may point to a directory
that already contains the official file named
`electron-v44.3.0-linux-x64.zip`. Packager does **not** re-verify a locally
supplied ZIP, so checksum it against Electron's published payload hash before
building:

```bash
sha256sum "$ELECTRON_ZIP_DIR/electron-v44.3.0-linux-x64.zip"
# expected: 8b49b9efdd73c0f467edc3c1cd5678392c384ccf224f34ff54179f736e2f384b
# (also listed in node_modules/electron/checksums.json after a trusted install)
```

When the variable is unset (the normal clean build), Electron Packager downloads
and verifies that archive through `@electron/get`.

`make:linux` runs the Vite production builds for the main, preload, and
renderer bundles, packages them into an ASAR with the Electron fuses applied,
and zips the result.

## Output contract

| Item                      | Path                                                                     |
|---------------------------|--------------------------------------------------------------------------|
| Unpacked application      | `out/Mac Markdown Workspace-linux-x64/`                                  |
| Distributable ZIP         | `out/make/zip/linux/x64/Mac Markdown Workspace-linux-x64-1.0.0.zip`      |
| Executable inside the ZIP | `Mac Markdown Workspace-linux-x64/mac-markdown-workspace`                |
| Application bundle        | `resources/app.asar` (contains `package.json` with `version`)            |
| Application license       | `resources/LICENSE` (MIT, Andrew Solomon)                                |
| Icon artwork              | `resources/icon.png` (512×512) and `resources/icon.svg`                  |
| Electron / Chromium notices | `LICENSE` (Electron) and `LICENSES.chromium.html` at the archive root  |
| Electron version stamp    | `version` file at the archive root (`44.3.0`)                            |

Naming rules (Forge/Packager defaults, verified in 7.11.1 / 18.4.4):

- The directory and ZIP basename derive from `productName`
  (`Mac Markdown Workspace`), the platform, the architecture, and the
  `package.json` version: `<productName>-<platform>-<arch>-<version>.zip`.
  The name contains spaces; quote it in shells and PKGBUILDs.
- The executable name is fixed by `packagerConfig.executableName` to
  `mac-markdown-workspace` regardless of `productName`. Launchers (#25) and the
  PKGBUILD (#24) should target that name.
- Bumping `version` in `package.json` changes the ZIP filename only.
- Electron derives the user-data directory from `productName`, so settings
  live under `~/.config/Mac Markdown Workspace/`. Notes are written under
  `app.getPath("documents")/Mac Markdown`. On a typical Omarchy/Arch desktop
  with XDG user dirs, that is `~/Documents/Mac Markdown`. If
  `XDG_DOCUMENTS_DIR` / `~/.config/user-dirs.dirs` is unset, Electron 44 on
  this host resolved "documents" to `$HOME`, so the library appeared at
  `$HOME/Mac Markdown` instead.

The ZIP is repeatable, not bit-identical: archive entries carry build
timestamps, so two builds of the same commit have different SHA-256 sums.
Record the checksum of the artifact you actually distribute.

## Icons

`assets/icons/icon.svg` is the canonical artwork (Teal accent `#1ea7bb` from
the design tokens). The tracked rasters are generated from it:

```bash
./assets/icons/build-icons.sh   # needs rsvg-convert (librsvg) and python3
```

This writes `assets/icons/icon.png` (512×512 RGBA, Linux) and
`assets/icons/icon.icns` (macOS, PNG-payload ICNS with 16–1024 px elements
including the @2x variants). Packager's extensionless `icon` setting resolves
`icon.icns` on Darwin and ignores the icon on Linux, which is why the PNG and
SVG are also copied into `resources/` via `extraResource`.

## Runtime dependencies (Arch package inventory)

Derived from `readelf -d` (`NEEDED`) of the packaged executable,
`chrome-sandbox`, and `chrome_crashpad_handler`, resolved with `ldd` and mapped
with `pacman -Qo`. `libffmpeg.so`, `libvulkan.so.1`, and
`libvk_swiftshader.so` are bundled inside the archive and resolve via
`$ORIGIN`; they are not system dependencies.

| Arch package     | Libraries used                                              |
|------------------|-------------------------------------------------------------|
| `glibc`          | `libc.so.6`, `libm.so.6`, `libdl.so.2`, `libpthread.so.0`, `ld-linux-x86-64.so.2` |
| `libgcc`         | `libgcc_s.so.1`                                             |
| `glib2`          | `libglib-2.0.so.0`, `libgobject-2.0.so.0`, `libgio-2.0.so.0` |
| `nss`            | `libnss3.so`, `libnssutil3.so`, `libsmime3.so`              |
| `nspr`           | `libnspr4.so`                                               |
| `at-spi2-core`   | `libatk-1.0.so.0`, `libatk-bridge-2.0.so.0`, `libatspi.so.0` |
| `gtk3`           | `libgtk-3.so.0`                                             |
| `pango`          | `libpango-1.0.so.0`                                         |
| `cairo`          | `libcairo.so.2`                                             |
| `dbus`           | `libdbus-1.so.3`                                            |
| `libcups`        | `libcups.so.2`                                              |
| `expat`          | `libexpat.so.1`                                             |
| `alsa-lib`       | `libasound.so.2`                                            |
| `mesa`           | `libgbm.so.1`                                               |
| `systemd-libs`   | `libudev.so.1`                                              |
| `libx11`         | `libX11.so.6`                                               |
| `libxcb`         | `libxcb.so.1`                                               |
| `libxcomposite`  | `libXcomposite.so.1`                                        |
| `libxdamage`     | `libXdamage.so.1`                                           |
| `libxext`        | `libXext.so.6`                                              |
| `libxfixes`      | `libXfixes.so.3`                                            |
| `libxrandr`      | `libXrandr.so.2`                                            |
| `libxkbcommon`   | `libxkbcommon.so.0`                                         |

These are direct link-time dependencies; `ldd` additionally pulls in their
transitive closure (e.g. `wayland`, `libdrm`, `fontconfig`, `freetype2`,
`harfbuzz`, `icu`, `gnutls`). They were all present on the validation host; a
future PKGBUILD should test and list the direct set above in `depends`.

## Sandbox requirements

The renderer runs with `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, ASAR-only loading, and the Electron fuses in
`forge.config.ts`. `--no-sandbox` is never used and must not be added to
launchers.

ZIP extraction does not preserve a setuid bit, so `chrome-sandbox` inside the
unpacked directory is **not** setuid root. Chromium then uses the
**user-namespace sandbox**, which requires unprivileged user namespaces:

```bash
sysctl user.max_user_namespaces     # must be > 0 (Arch default: large)
cat /proc/sys/kernel/unprivileged_userns_clone   # 1 if the sysctl exists
```

If user namespaces are disabled, the app aborts with a
"SUID sandbox helper binary" / "No usable sandbox" error. The fix is to enable
user namespaces (or, for an installed package, to install `chrome-sandbox` as
setuid root as system Electron packages do), not to disable the sandbox.

## Launching and troubleshooting

```bash
unzip "out/make/zip/linux/x64/Mac Markdown Workspace-linux-x64-1.0.0.zip" \
  -d "$HOME/Applications"
"$HOME/Applications/Mac Markdown Workspace-linux-x64/mac-markdown-workspace"
```

- On Wayland sessions Electron 44 selects the Wayland Ozone backend
  automatically. A single "`--ozone-platform=wayland` is not compatible with
  Vulkan" line on stderr is expected and harmless (Vulkan is disabled).
- Passing `--version` to the packaged binary is **not** supported: the
  `RunAsNode` fuse is off, so Electron treats it as an app launch. Read the
  `version` file next to the executable instead.
- The app is fully offline-capable. Notes are written to
  `~/Documents/Mac Markdown/<id>.md`; the close guard flushes pending saves
  before the window closes.
- Chromium's crash handler (`chrome_crashpad_handler`) runs with
  `no_channel`; nothing is uploaded.

## macOS regression boundary

`bun run make` (Darwin ZIP) is unchanged in configuration: `MakerZIP` now
lists both `darwin` and `linux`, and the icon path resolves to
`assets/icons/icon.icns`. On Linux, Packager can only cross-package a Darwin
bundle without signing or launching it, so the authoritative macOS check
(build, Gatekeeper/launch, icon in Finder) must be run on a macOS host. See the
dated validation record for what was and was not verified.
