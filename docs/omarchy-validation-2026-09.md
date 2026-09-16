# Omarchy qualification — 2026-09

> **Status:** ⚠ Pending — populated automatically by
> `scripts/native-test/installed-package-smoke.sh` on the maintainer's
> Omarchy host. Manual edits are allowed but must reference a re-run.

This document records the result of the
[`installed-package-smoke.sh`](scripts/native-test/installed-package-smoke.sh)
on the maintainer's Omarchy machine. It is the canonical evidence for
the AC2 / AC5 claims in [issue #29](https://github.com/andysolomon/mac-markdown-workspace/issues/29).

## Recorded environment

| Field | Value |
|-------|-------|
| Host | Omarchy 4.0.3 (Arch x86_64, kernel 6.x) |
| Compositor | Hyprland |
| GPU | (filled by smoke script) |
| Electron | (filled by smoke script) |
| Display scaling | (filled by smoke script) |
| Package SHA-256 | (filled by smoke script) |
| Package size | (filled by smoke script) bytes |
| Run timestamp | (filled by smoke script) |

## Smoke phases

The script runs 11 phases. Each phase either PASSes or FAILs the
qualification for the maintainer's machine; the table is appended by
the script when it succeeds.

| # | Phase | Result |
|---|-------|--------|
| 1 | install (`pacman -U`) | _pending_ |
| 2 | launch (offline) | _pending_ |
| 3 | offline create / edit / save / close | _pending_ |
| 4 | relaunch + verify note persists | _pending_ |
| 5 | import (host-argument open) | _pending_ |
| 6 | exports (txt / html / pdf / docx) | _pending_ |
| 7 | settings persistence | _pending_ |
| 8 | sync status (N/A on Arch) | _pending_ |
| 9 | upgrade preserves library | _pending_ |
| 10 | removal preserves library | _pending_ |

## Manual re-run

```sh
sudo /home/andysolomon/Work/src/mac-markdown-workspace/scripts/native-test/installed-package-smoke.sh \
  --package packaging/arch/mac-markdown-workspace-1.0.0-1-x86_64.pkg.tar.zst \
  --upgrade-package packaging/arch/mac-markdown-workspace-1.1.0-1-x86_64.pkg.tar.zst \
  --report docs/omarchy-validation-2026-09.md
```

## Limitations recorded here

- **ARM64 is NOT supported.** The recipe pins `arch=('x86_64')`.
- **Offline PWA is NOT claimed.** The web build ships without a
  service worker. Treat it as online-only.
- **Public distribution is NOT claimed.** The Arch recipe lives in a
  private repo; Omarchy *Install ▸ AUR* will fail with `package not found`.
- **macOS / iOS code signing is NOT configured.** Forge produces an
  unsigned DMG / Xcode project; distributing to other machines requires
  a developer certificate that the maintainer does not hold.
- **CI cannot run installed-package tests.** They require sudo and a
  Wayland session. The `arch-validate.yml` workflow exposes them as a
  manual dispatch gated on a `self-hosted, omarchy, x86_64` runner
  label; on hosted runners the `smoke` job is skipped.

## macOS / iOS manual validation

For the Apple platforms the script writes a static section here when
the maintainer runs a real device or VM:

| Platform | Last validated | Method | Result |
|----------|----------------|--------|--------|
| macOS 14.x (Apple Silicon) | _TBD_ | _TBD_ | _TBD_ |
| iOS 17.x (iPhone, dev build) | _TBD_ | _TBD_ | _TBD_ |

Any "X is broken on iOS" bug filed without a row here for the reported
iOS version will be closed with "needs reproduction evidence".

## When to re-run

Re-run this script when:

- `packaging/arch/PKGBUILD` changes the dependency set, the install
  layout, or the `chrome-sandbox` handling.
- `bun run make:linux` changes how the Linux ZIP is structured (e.g.,
  bumping Electron).
- `useHostOpenFiles` or `useFileOperations` change how files land in
  the active note.
- `notesStore.ts` changes the persistence format.

Cross-reference the commit SHA in `docs/issue-29-progress.txt` for the
specific re-run that produced each row in the table above.
