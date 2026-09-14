# Linux build validation — 2026-09

Issue #23 implementation evidence captured on 2026-09-14. This record only
claims checks observed on the current Arch Linux host; the independent ARC
Verify phase remains responsible for final acceptance.

## Source and toolchain

| Item | Observed value |
| --- | --- |
| Source commit (before uncommitted issue changes) | `0b92aa75e7f0c11d821596416fa0805647d15d49` |
| Host | `Linux 7.1.9-arch1-2 x86_64 GNU/Linux` |
| User | ordinary user `andysolomon` (UID 1000) |
| Bun | `1.4.2` |
| Node.js / npm | `v26.7.0` / `11.19.0` |
| Electron | `44.3.0` |
| Electron Forge / Packager | `7.11.1` / `18.4.4` |

An isolated-install scratch checkout was inspected after
`bun install --frozen-lockfile`; its lock hash before and after installation
was identical. The worker-created scratch directory was removed after evidence
capture so it cannot contaminate repository test discovery:

```text
a670c8fe226368ad7ff76b0db59d8f74d6ee3f0ee4ac7dc7838e77a041265295  bun.lock
```

That hash also matches the repository `bun.lock`. The isolated install contains
`node_modules/electron/dist/version` = `44.3.0` and an executable
`node_modules/electron/dist/electron` with mode `755`. This confirms the
frozen lockfile was not rewritten and the Electron payload was installed.

## Build and artifact

The first `bun run make:linux` attempt reached Electron packaging and failed
with `getaddrinfo EAI_AGAIN github.com` because this runner has restricted DNS.
The documented network-isolated repeat path then succeeded:

```bash
ELECTRON_ZIP_DIR=/home/andysolomon/.cache/electron/f9c7436ab4a2c1ed6ac6cea2902187de75bd5b7a60c0973ad8967c318a6313c3 \
  bun run make:linux
```

The supplied cache directory contained the official-name input
`electron-v44.3.0-linux-x64.zip`. Its SHA-256 is
`8b49b9efdd73c0f467edc3c1cd5678392c384ccf224f34ff54179f736e2f384b`, matching
`node_modules/electron/checksums.json`. Forge selected only the ZIP maker and
completed the main, preload, renderer, package, fuse, and ZIP steps.

| Property | Observed value |
| --- | --- |
| Artifact | `out/make/zip/linux/x64/Mac Markdown Workspace-linux-x64-1.0.0.zip` |
| Size | `127602165` bytes |
| SHA-256 | `697a63cceca68d3419d3aee4800c277456488dc0498888c32267b4e97a2dbe58` |
| Runtime stamp | `44.3.0` |
| Executable | `Mac Markdown Workspace-linux-x64/mac-markdown-workspace`, mode `755` unpacked |

`unzip -t` reported no compressed-data errors. Manifest inspection confirmed:

- `resources/app.asar` with `name=mac-markdown-workspace`,
  `productName=Mac Markdown Workspace`, `version=1.0.0`, and the expected main;
- tracked `resources/icon.png` and `resources/icon.svg`, byte-identical to the
  source assets; the PNG is 512×512 RGBA;
- `resources/LICENSE`, byte-identical to the repository MIT license;
- Electron `LICENSE`, `LICENSES.chromium.html`, `version`, locales,
  `chrome-sandbox`, `chrome_crashpad_handler`, and bundled shared libraries.

The tracked ICNS parsed as an 86,101-byte ICNS containing 11 PNG-backed
elements (`icp4`, `icp5`, `icp6`, `ic07`–`ic14`).

## Runtime dependencies

`readelf -d` and `ldd` were run against the packaged executable,
`chrome-sandbox`, and `chrome_crashpad_handler`. No dependency was reported as
`not found`. Direct NEEDED entries and their `pacman -Qo` owners agree with the
inventory in `docs/linux-build.md`; examples observed on this host include
`gtk3 1:3.24.52-1`, `nss 3.128-1`, `mesa 1:26.2.2-1`, and
`alsa-lib 1.2.16.1-1`. Bundled `libffmpeg.so` resolved from the artifact.

## Focused quality checks

| Check | Result |
| --- | --- |
| `bun run typecheck` | passed |
| `bun run lint` | passed with one pre-existing warning in `src/ios/capacitorApi.ts` |
| `bun run test` | passed: 25 files, 210 tests |
| `bun run web:build` | passed |
| `bun run ios:build` | passed |
| `bun run test:e2e` | passed: 5 Playwright Electron tests |

The independent ARC Verify phase remains pending.

## Launch result

A containerized worker launch (no `--no-sandbox`) aborted before UI startup
with `sandbox_host_linux.cc: Operation not permitted`. That failure is not
used as the Arch/Omarchy result.

On the native Omarchy session (UID 1000, `WAYLAND_DISPLAY=wayland-1`,
`user.max_user_namespaces=2147483647`, `unprivileged_userns_clone=1`) the
unpacked executable launched without a sandbox override. Isolated
`HOME=/tmp/mmw-issue23-smoke-home` was used so the operator's real library was
not touched. Chromium DevTools Protocol (`--remote-debugging-port=9333`) drove
the UI; Playwright's `_electron.launch` was not used because it injects
`--no-sandbox`.

Observed:

- Window class `mac-markdown-workspace`, title `Mac Markdown Workspace`, native Wayland.
- Renderer argv included `--enable-sandbox` and did not include `--no-sandbox`.
- Create + Save wrote `Issue23 smoke marker #issue23-smoke`.
- Because the isolated home had no XDG user-dirs file, Electron's documents
  path was `$HOME`, so the note landed at
  `/tmp/mmw-issue23-smoke-home/Mac Markdown/<id>.md` rather than
  `$HOME/Documents/Mac Markdown`.
- SIGTERM quit the process (the close-flush guard can ignore a compositor
  close). Relaunch with the same isolated HOME restored the marker in the
  document list and editor.

## Remaining external checks

- macOS-host Darwin ZIP build, launch, signing/Gatekeeper, and Finder icon check;
- the independent Verify phase and clean-checkout acceptance review.
