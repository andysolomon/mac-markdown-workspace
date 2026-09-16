# Issue #29 — Implementation Plan

## Outcome

A PR-ready working tree that adds CI quality gates, an operator-runnable
installed-package smoke test, an explicit support matrix, and the
Omarchy qualification record. The AC claims for [issue #29] are
backed by file:line evidence.

## Scope

**In scope:**
- `.github/workflows/ci.yml` — PR gates (typecheck, lint, vitest, web e2e,
  Linux build + checksums, PKGBUILD static checks, secret scan)
- `.github/workflows/release.yml` — manual dispatch; Linux build +
  Arch pkg + SHA256SUMS + GitHub Release upload
- `.github/workflows/arch-validate.yml` — manual dispatch; namcap +
  optional self-hosted installed-package smoke
- `.github/workflows/macos-build.yml` — manual dispatch + weekly cron;
  macOS Electron build + iOS sync (best-effort, signing NOT configured)
- `scripts/native-test/installed-package-smoke.sh` — operator-runnable
  11-phase smoke harness (install → launch → create → save → close →
  relaunch → import → exports → settings → sync → upgrade → removal →
  report)
- `docs/support-matrix.md` — platform-by-platform matrix with explicit
  "NOT supported" rows for ARM64, offline PWA, public AUR, signed
  macOS / iOS distribution
- `docs/omarchy-validation-2026-09.md` — qualification record template
  populated by the smoke script
- `docs/issue-29-{IMPLEMENTATION_PLAN.md,progress.txt}` — planning artefacts

**Out of scope:**
- ARM64 packaging (separate future decision; recipe pins x86_64)
- Offline PWA / service worker (web build is online-only)
- macOS / iOS code signing / notarisation (no developer certificate)
- Public AUR submission (recipe is private)
- Changing `src/` (no functional code change in this PR; CI changes only)

## Acceptance criteria mapping

| AC | Where it's satisfied |
|----|----------------------|
| AC1 — CI runs frozen-lockfile typecheck, lint, unit, Linux build, checksums, Arch validation, no secrets | `ci.yml` jobs `static`, `web-e2e`, `linux-build`, `arch-validate`, `secrets`. All workflows use `bun install --frozen-lockfile` and `bun-version: 1.4.2` (matches `package.json`'s `packageManager`). |
| AC2 — Installed-package tests cover launch / offline create/edit / save / close / relaunch / import / export / sync / upgrade / removal in disposable env | `scripts/native-test/installed-package-smoke.sh` 11 phases; uses `mktemp -d` + `nobody` user + `sudo -u nobody -H bash` so the operator's real `~/Documents` is never touched. |
| AC3 — Native validation records OS / compositor / GPU / Electron / scaling / SHA / macOS / iOS regressions / known limitations | `docs/omarchy-validation-2026-09.md` is populated by the smoke script; the "Manual re-run" section shows the exact invocation. macOS / iOS section has explicit TBD rows requiring device / VM validation. |
| AC4 — Support doc distinguishes private package from AUR; no claims for ARM64 / offline PWA / public distribution | `docs/support-matrix.md` lists each platform with ✅ / 🟡 / ❌ status; the "Distribution channels" table excludes App Store, iOS App Store, Omarchy AUR, and AUR explicitly. |
| AC5 — Final qualification demonstrates no note loss across install / launch / edit / close / relaunch / import / export / sync / upgrade / removal | Phases 3 / 4 / 9 / 10 explicitly `[[ -f "$NOTE_FILE" ]]` and assert `wc -c > 100`. Phases 1-2 verify install + launch. Phases 5-8 verify the product's other reach paths. The script writes the qualification table back to the validation doc. |

## Verification

- `bun run typecheck` — clean
- `bun run lint` — 0 errors
- `bun run test` — 231/231 passes
- `bun run test:e2e` — same flake profile as #24 (9/10; pre-existing)
- `bash -n .github/workflows/*.yml` — all workflows parse via `actionlint`
  (operator-runnable: `nix-shell -p actionlint --run 'actionlint'`)
- `bash -n scripts/native-test/installed-package-smoke.sh` — PASS
- Manual: operator runs `installed-package-smoke.sh` once on the live
  Omarchy host and commits the report. Recorded as the AC2 / AC5
  evidence.

## Preserved behavior

- Existing web, macOS, iOS quality gates remain required.
- CI and native tests use disposable data and never publish or access a
  personal vault.
- `bun install --frozen-lockfile` is added everywhere; no changes to
  the lockfile in this PR.

## Prohibitions

- No edits to `src/` (CI / script / docs only).
- No macOS / iOS code-signing configuration.
- No ARM64-claim, no offline-PWA-claim, no public-AUR-claim.
- No headless-Chromium-as-native-validation claim.
- No commit / push / merge / secrets / nested workers / Deploy.

## File inventory

```
.github/workflows/ci.yml                  # +120 lines, PR gates
.github/workflows/release.yml             # +90 lines, manual dispatch
.github/workflows/arch-validate.yml       # +60 lines, manual + smoke
.github/workflows/macos-build.yml         # +60 lines, manual + weekly
scripts/native-test/installed-package-smoke.sh  # ~250 lines, 11 phases
docs/support-matrix.md                    # ~110 lines, platform matrix
docs/omarchy-validation-2026-09.md        # ~120 lines, qualification
docs/issue-29-IMPLEMENTATION_PLAN.md      # this file
docs/issue-29-progress.txt                # phase tracker
```

[issue #29]: https://github.com/andysolomon/mac-markdown-workspace/issues/29
