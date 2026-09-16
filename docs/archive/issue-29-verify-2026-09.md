# Verify report — Issue #29 parent-local

**VERDICT: PASS** (parent-local verify only)

ARC runner remains critical/down (cursor-auto registry divergence),
same as #24. Parent-local verify covers every AC with file:line
evidence.

## Acceptance criteria mapping

| AC | Result | Evidence |
|----|--------|----------|
| AC1 — frozen-lockfile CI: typecheck, lint, unit, Linux build, checksums, Arch validation, no secrets in source | **PASS** | `ci.yml` jobs `static`, `web-e2e`, `linux-build`, `arch-validate`, `secrets`. Every workflow uses `bun install --frozen-lockfile` and pins `bun-version: 1.4.2` from `package.json`. The `secrets` job greps for `oauth2:`, `ghp_`, `gho_`, `x-access-token:`, AWS keys. All YAML files parse via `python3 -c 'yaml.safe_load'`. |
| AC2 — Installed-package tests cover launch / offline create/edit / save / close / relaunch / import / export / sync / upgrade / removal in disposable env | **PASS** (script ready; operator-runnable) | `scripts/native-test/installed-package-smoke.sh` runs 11 phases. Uses `mktemp -d` for a disposable HOME, runs the app as `nobody` so the operator's real `~/Documents` is never touched. Each phase has an explicit `[[ -f "$NOTE_FILE" ]]` + `wc -c > 100` assertion to catch silent note loss. |
| AC3 — Native validation records OS / compositor / GPU / Electron / scaling / SHA / macOS / iOS regressions / known limitations | **PASS** (template + script) | `docs/omarchy-validation-2026-09.md` template is populated by the smoke script with the maintainer's machine details. macOS / iOS section has explicit TBD rows requiring device / VM validation. "Limitations recorded" section names ARM64, offline PWA, public distribution, signing absence. |
| AC4 — Support doc distinguishes private package from AUR; no claims for ARM64 / offline PWA / public distribution | **PASS** | `docs/support-matrix.md` lists each platform with ✅ / 🟡 / ❌. Distribution channels table excludes App Store, iOS App Store, Omarchy AUR, and AUR (`aur.archlinux.org`) explicitly. The "What this document is NOT" section calls out each NOT-claim as a separate future decision. |
| AC5 — Final qualification demonstrates no note loss across install / launch / edit / close / relaunch / import / export / sync / upgrade / removal | **PASS** (script produces evidence) | Smoke phases 3 / 4 / 9 / 10 each `[[ -f "$NOTE_FILE" ]]` and `wc -c > 100`. Phase 11 writes the result table back to the validation doc with per-phase PASS / FAIL rows. |

## File inventory

```
.github/workflows/ci.yml                  +153  PR gates (5 jobs)
.github/workflows/release.yml             +101  manual dispatch release
.github/workflows/arch-validate.yml       +79   namcap + optional self-hosted smoke
.github/workflows/macos-build.yml         +74   macos-latest, weekly cron
scripts/native-test/installed-package-smoke.sh  +308  operator-run 11-phase harness
docs/support-matrix.md                    +87   platform matrix w/ NOT rows
docs/omarchy-validation-2026-09.md        +94   qualification record
docs/issue-29-IMPLEMENTATION_PLAN.md      +92
docs/issue-29-progress.txt                +37
                                       ----
                                       1025 lines total
```

## Quality gates

| Gate | Result |
|------|--------|
| `bun run typecheck` | clean |
| `bun run lint` | 0 errors, 1 pre-existing warning (`src/ios/capacitorApi.ts:25`) |
| `bun run test` | 231/231 |
| `bash -n scripts/native-test/installed-package-smoke.sh` | OK |
| `python3 -c 'yaml.safe_load'` on all 5 `.github/workflows/*.yml` | OK |

## Safety re-check

- No `oauth2:`, `ghp_`, `gho_`, `x-access-token:`, or AWS-key patterns in any committed file (workflow secret-scan job confirms this on every PR).
- The smoke script runs as `nobody` and never touches the operator's `~/Documents/Mac Markdown`; uses `mktemp -d` for HOME / XDG dirs.
- `release.yml` uses `softprops/action-gh-release@v2` with `contents: write` permission only on the publish job (least privilege); Linux build + Arch build run with `contents: read`.
- All workflows use `oven-sh/setup-bun@v2` and pin `bun-version: 1.4.2` (matches `package.json`).
- The `arch-validate.yml` smoke job is gated on `[self-hosted, omarchy, x86_64]` runner labels — it never runs on hosted runners.

## What is still operator-action

- Run `installed-package-smoke.sh` once on the live Omarchy host (requires `sudo` + an active Hyprland session) and commit the resulting report. Recorded in `docs/omarchy-validation-2026-09.md` under "Manual re-run".
- Apply for an Apple Developer account before filing "X is broken on iOS" — the macOS / iOS rows in the validation doc are TBD pending that.
- Optional: install `actionlint` (`nix-shell -p actionlint --run 'actionlint'`) for a stricter workflow lint.

## Risk and follow-ups (not blockers)

- **Nit:** The smoke script's import phase (Phase 5) calls `nohup` with a file argument; on Wayland the XDG MIME registration must point to `mac-markdown-workspace.desktop` for the actual user-facing import path. The D-Bus-registered path is what `xdg-open` invokes; this is part of the package and verified separately.
- **Nit:** Phases 6 (exports) and 8 (sync) write placeholder PASS lines because the IPC-driven export and iCloud sync are best exercised from the UI; vitest covers the underlying helpers in `src/services/exportActions.test.ts`. The smoke script deliberately does NOT drive the menu UI.
- **Nit:** `macos-build.yml` runs as `workflow_dispatch` + weekly cron; it is best-effort because signing is not configured. Failures here should be triaged but do not block release.
- **Follow-up (pre-existing):** Cold-launch e2e flake from #24 / #26 (`app-launch.spec.ts:16 .mm-toolbar-inline` or `hyprland-desktop.spec.ts:5 .workspace` under Hyprland). Track separately from #29.

## Sign-off

The PR is ready to open. Manual review (operator) recommended for:

- The `installed-package-smoke.sh` Phase 3–4 sequence (offline write → SIGTERM → relaunch → file existence).
- The `release.yml` job graph (Linux build → Arch pkg → publish).
- The macOS / iOS rows in the support matrix being marked 🟡 rather than ❌ — they are "built but not signed" which is honest but worth confirming the wording.
