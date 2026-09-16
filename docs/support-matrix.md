# Support matrix

This document records the supported platforms, the explicit limitations
of each, and the qualification workflow. The goal is for a new user to
know exactly what they are getting and what they are not.

## Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| **Linux / Arch (x86_64)** | ✅ Supported on Omarchy 4.x with Hyprland | Built and packaged via `bun run make:linux` + `packaging/arch/PKGBUILD`. See `docs/arch-pkgbuild.md` for the install flow. |
| **Linux / Arch (ARM64)** | ❌ **NOT supported** | Recipe pins `arch=('x86_64')`. ARM64 packaging is a separate, future decision. Do not file "ARM64 broken" bugs against this codebase. |
| **macOS (Electron)** | 🟡 Built; signing NOT configured | `bun run make` produces `out/make/zip/darwin/`. Code signing / notarisation is intentionally commented out in `forge.config.ts`; distributing to other Macs requires a developer certificate that the maintainer does not hold. **Local development and personal use only.** |
| **iOS (Capacitor)** | 🟡 Project regenerable; signing NOT configured | `ios/App/` is gitignored. `bun run ios:sync` rebuilds the native project from `capacitor.config.ts`. App Store / TestFlight / device deployment requires an Apple Developer account and signing that the maintainer does not hold. |
| **Web (browser)** | ✅ Supported | `bun run web:dev` (Vite on :3000) and `bun run web:build` (`dist-web/`). Stored in IndexedDB (\`mmw-notes\`). Deployed to GitHub Pages. |
| **Offline PWA** | ❌ **NOT supported** | The web build does not ship a service worker. Treat it as online-only. |
| **Public AUR distribution** | ❌ **NOT supported** | The Arch recipe lives in a private repo. Publishing to `aur.archlinux.org/` requires an anonymous source URL the maintainer does not have. See `packaging/arch/install-guide.md` for the distinction. |

## Distribution channels

| Channel | Used by |
|---------|---------|
| GitHub Releases (private + public artifacts) | Linux x64 ZIP, Arch x86_64 `.pkg.tar.zst` |
| GitHub Pages | Web |
| Mac App Store | ❌ — no certificate |
| iOS App Store | ❌ — no certificate |
| Omarchy *Install ▸ AUR* | ❌ — recipe is private |
| AUR (`aur.archlinux.org`) | ❌ — recipe is private |

## Data locations

| Platform | Notes file | Settings file |
|----------|------------|---------------|
| Linux (Arch package) | `~/Documents/Mac Markdown/*.md` | `~/.config/mac-markdown-workspace/settings.json` |
| Linux (Dev build, `bun start`) | same as packaged | same |
| macOS | `~/Documents/Mac Markdown/*.md` | `~/Library/Application Support/mac-markdown-workspace/settings.json` |
| iOS | Documents/notes (App Group) or Library/NoCloud/notes — controlled by the `iosStorage` setting | same dir |
| Web | IndexedDB `mmw-notes` (browser-managed) | localStorage |

Backup / restore: copy the `Notes` directory. Settings: copy
`settings.json` into the equivalent path on the destination platform.
Schema migration is owned by the app; the file format is forward-compatible.

## Sync

| Platform | Sync target |
|----------|-------------|
| iOS | iCloud Drive (optional; gated by the `iosStorage` setting) |
| macOS / Linux / Web | **None** — single-device only |

## CI gates (PR + main)

| Gate | Workflow | Required for merge |
|------|----------|--------------------|
| Typecheck (`bun run typecheck`) | `.github/workflows/ci.yml` | yes |
| Lint (`bun run lint`) | `.github/workflows/ci.yml` | yes |
| Unit tests (`bun run test`) | `.github/workflows/ci.yml` | yes |
| Web e2e (`bun run test:e2e -- --project=web`) | `.github/workflows/ci.yml` | yes |
| Linux build + checksums | `.github/workflows/ci.yml` | yes |
| PKGBUILD static checks (bash -n, no embedded tokens) | `.github/workflows/ci.yml` | yes |
| `.SRCINFO` matches `makepkg --printsrcinfo` | `.github/workflows/ci.yml` | yes |
| Secret / token scan | `.github/workflows/ci.yml` | yes |
| macOS Electron build (no signing) | `.github/workflows/macos-build.yml` | manual dispatch only |
| iOS sync (Xcode tooling required) | `.github/workflows/macos-build.yml` | manual dispatch only |
| Arch namcap + package validation | `.github/workflows/arch-validate.yml` | manual dispatch only |
| Installed-package smoke (Omarchy) | `.github/workflows/arch-validate.yml` + `scripts/native-test/installed-package-smoke.sh` | operator-only, on the maintainer's Omarchy host |

## Releases

The `release.yml` workflow is `workflow_dispatch` only. It:

1. Builds the Linux x64 ZIP.
2. Rebuilds the Arch package on `archlinux:latest`.
3. Composes `SHA256SUMS` from all artifacts.
4. Creates / updates a GitHub Release with the artifacts and the manifest.

Operator inputs: tag (required), notes (optional).

## What this document is NOT

- It is NOT a roadmap for adding ARM64, offline PWA, public AUR, or
  signed macOS / iOS distribution. Those are separate future decisions
  and require infrastructure (Apple Developer account, AUR submission)
  that the maintainer does not currently have.
- It is NOT a substitute for the Omarchy qualification record in
  `docs/omarchy-validation-2026-09.md`. Read that file before filing
  "this is broken on Omarchy" bugs.
