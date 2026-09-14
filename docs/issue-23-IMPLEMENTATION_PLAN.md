# Issue #23 — Reproducible Linux Electron Artifact Implementation Plan

**Story:** [#23](https://github.com/andysolomon/mac-markdown-workspace/issues/23) — Produce a reproducible Linux Electron build with complete application assets  
**Branch:** `feat/issue-23-linux-artifact`

## 1. Product goal and scope boundaries

Produce a self-contained, versioned Electron ZIP for Linux x86_64 that can be built from a clean checkout with Bun's frozen lockfile, launched offline as an ordinary Arch/Omarchy user with Chromium sandboxing enabled, and inspected for application metadata, icons, and license notices.

In scope:

- Linux x86_64 packaging through Electron Forge's ZIP maker.
- A stable executable and artifact basename derived from `mac-markdown-workspace`, platform, architecture, and package version.
- A maintained exact Electron pin (`44.3.0`) and a documented exact Bun toolchain (`1.4.2`).
- Tracked source/raster/macOS icon assets generated from the existing Teal design token (`#1ea7bb`).
- The full MIT license text and explicit inclusion of the application license in packaged resources alongside Electron/Chromium notices.
- Linux runtime dependency inventory and local validation evidence.
- Regression checks for the existing macOS package configuration.

Out of scope:

- Arch `PKGBUILD`, pacman install/upgrade, or system Electron integration (#24).
- CLI/file-manager opening, `.desktop` installation, MIME associations, and single-instance behavior (#25).
- Hyprland menus, shortcuts, and layout rules (#26).
- CI workflows, installed-package automation, and the support guide (#29).
- Linux ARM64 or any architecture other than x86_64.
- Publishing, uploading, signing, or deploying an artifact.

## 2. Current baseline

- `forge.config.ts` defines Squirrel, DEB, RPM, and a ZIP maker restricted to Darwin. Its extensionless `./assets/icons/icon` reference currently points to no tracked files.
- `package.json` has generic `package`/`make` scripts but no deterministic Linux-x64 ZIP command. It pins Electron `41.0.2` and declares Bun `1.2.19`; Electron 41 is outside the current supported Electron majors.
- The current local `node_modules/electron` installation lacks its platform binary, so it cannot launch or package Electron. A clean install must explicitly allow Electron's trusted install script.
- The repository declares MIT in `package.json` and README but has no root `LICENSE` file.
- Electron security settings already use `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, ASAR packaging, and hardened fuses; these are invariants.
- DEB/RPM makers require tools absent from this Arch host. They remain available for explicit future use, but the Linux prerequisite command must target ZIP only.

## 3. Missing capabilities

| Capability | Gap | Planned repository outcome |
| --- | --- | --- |
| Reproducible Linux artifact | ZIP runs only on Darwin; no Linux-specific script | Linux-enabled `MakerZIP` plus `make:linux` fixed to `linux/x64/zip` |
| Maintained bounded runtime | Electron 41 is no longer supported | Exact Electron `44.3.0` pin and regenerated `bun.lock` |
| Reliable Electron install | Local package has no downloaded binary | Bun `trustedDependencies` entry for Electron and frozen-install verification |
| Stable identity | Packaging relies on defaults and lowercase product metadata | Explicit executable name, human-readable product name, versioned artifact contract |
| Complete icons | Referenced icon path does not exist | Canonical SVG, 512px PNG, and ICNS under `assets/icons/` |
| License completeness | No tracked full MIT text | Root `LICENSE`, copied into packaged resources; Electron/Chromium notices asserted |
| Runtime/support evidence | No Linux build or dependency documentation | `docs/linux-build.md` and a dated validation record |
| macOS regression evidence | Icon input is missing and Linux cannot fully make Darwin output | Config/type checks locally; full Darwin ZIP validation explicitly assigned to macOS |

## 4. Milestones and phases

### Phase 1 — Package identity, assets, and licensing

**Goal:** Supply every static input needed by Electron Packager on Linux and macOS.

**Deliverables:**

1. Update `package.json` metadata:
   - keep the package/executable identity `mac-markdown-workspace`;
   - set human-readable `productName` to `Mac Markdown Workspace`;
   - pin `electron` to `44.3.0`;
   - set `packageManager` to `bun@1.4.2`;
   - trust only Electron's install script through Bun's `trustedDependencies`;
   - add `make:linux` using `electron-forge make --platform linux --arch x64 --targets @electron-forge/maker-zip`.
2. Regenerate `bun.lock` with Bun 1.4.2, then prove `bun install --frozen-lockfile` succeeds without changing it.
3. Add `assets/icons/icon.svg` as the canonical vector artwork using the existing Teal palette, generate a 512×512 `assets/icons/icon.png` for Linux, and generate `assets/icons/icon.icns` for the existing macOS icon path.
4. Add the complete MIT text at repository root as `LICENSE`, attributed to Andrew Solomon.

**Dependencies:** Approved generated-icon direction and maintained-stack baseline.

**Risks:** Electron 44 may expose compatibility regressions; ICNS generation on Linux must produce a valid multi-size icon; changing `productName` changes the packaged directory/display name but not the stable executable.

**Acceptance criteria:** All referenced assets are tracked and parseable; package metadata is exact; a clean frozen install downloads an executable Electron 44.3.0 binary.

### Phase 2 — Linux ZIP packaging contract

**Goal:** Produce only the portable ZIP prerequisite on Arch without requiring DEB/RPM toolchains.

**Deliverables:**

1. Update `forge.config.ts` to:
   - make ZIP available on both `darwin` and `linux`;
   - set `packagerConfig.executableName` to `mac-markdown-workspace`;
   - preserve ASAR, app bundle ID/category, icon path, fuse hardening, and renderer/main/preload build configuration;
   - copy the application `LICENSE` into `resources/` so it remains distinct from Electron's top-level license;
   - retain DEB/RPM/Squirrel makers unchanged for their existing explicit platform use.
2. Build with `bun run make:linux` from a clean Linux x86_64 checkout.
3. Establish the artifact contract:
   - unpacked application: `out/Mac Markdown Workspace-linux-x64/` (Forge/Packager display-name output);
   - distributable: `out/make/zip/linux/x64/Mac Markdown Workspace-linux-x64-1.0.0.zip`;
   - executable inside the archive: `mac-markdown-workspace`.
4. If Forge's actual versioned filename differs, either configure a deterministic post-make rename in `forge.config.ts` or document the stable actual path; do not leave an undocumented implementation-dependent filename.

**Dependencies:** Phase 1.

**Risks:** Spaces introduced by the human-readable product name affect shell quoting and may alter Forge's output basename. ZIP extraction does not preserve a setuid sandbox bit, so successful sandboxed launch depends on enabled unprivileged user namespaces; launching with `--no-sandbox` is forbidden.

**Acceptance criteria:** The documented command emits one versioned Linux x64 ZIP without invoking `dpkg`, `rpmbuild`, macOS signing, or macOS tooling.

### Phase 3 — Artifact and runtime validation

**Goal:** Prove that the result is complete, offline-capable, sandboxed, and persistent on Omarchy/Arch.

**Deliverables:**

1. Inspect the unpacked ZIP and record:
   - executable, `chrome-sandbox`, locales, shared libraries, `resources/app.asar`, application license, Electron `LICENSE`, `LICENSES.chromium.html`, and version metadata;
   - `sha256sum` of the final ZIP;
   - Electron, Forge, Bun, Node, kernel, architecture, and commit versions.
2. Derive the runtime dependency inventory from `ldd` against the packaged executable and bundled libraries, map external paths to Arch packages with `pacman -Qo`, and document the minimum observed dependency set in `docs/linux-build.md`.
3. Launch the unpacked executable as an ordinary user with no `--no-sandbox` override, capture logs, and confirm no SUID/user-namespace sandbox initialization error.
4. Perform a create/edit/quit/relaunch smoke test:
   - create a uniquely named note;
   - edit and flush it;
   - confirm the `.md` file under `~/Documents/Mac Markdown`;
   - quit through the existing close guard;
   - relaunch while networking is disabled or isolated and confirm the note remains available.
5. Run the implementation-phase checks after the Electron upgrade: `bun run typecheck`, `bun run lint`, and `bun run test`. Defer full web, iOS, and E2E gates to the required independent Verify phase.

**Dependencies:** Phase 2 and a graphical Arch/Omarchy session.

**Risks:** Existing Playwright helpers launch the development Electron binary rather than the packaged artifact; the packaged create/edit/relaunch pass is therefore manual in #23, while installed-package automation remains #29. Disabling networking must not disrupt unrelated host services.

**Acceptance criteria:** The app launches offline as a normal user with renderer sandboxing retained, persists a smoke-test note across relaunch, and all locally runnable quality gates pass.

### Phase 4 — Documentation and macOS regression boundary

**Goal:** Make the build reproducible for the next packaging stories without claiming unperformed validation.

**Deliverables:**

1. Add `docs/linux-build.md` with prerequisites, exact frozen-lockfile commands, target/architecture limitations, output naming, runtime dependency inventory, sandbox requirements, and troubleshooting boundaries.
2. Add a dated `docs/linux-build-validation-2026-09.md` containing the exact versions, commit, artifact filename/checksum, contents inspection, launch log summary, dependency inventory command/output summary, and create/edit/relaunch evidence.
3. Update `README.md` with separate macOS and Linux artifact commands and links to the Linux build guide.
4. Validate locally that Forge config loading/typechecking and a Darwin package dry/package invocation still resolve the new ICNS asset without changing macOS target configuration.
5. Record full `bun run make`/Darwin ZIP production as pending on a macOS host if no macOS runner is available; do not claim cross-platform success from Linux cross-packaging alone.
6. Update `docs/issue-23-progress.txt` after each verified step. On eventual merge, move the issue plan and progress files to `docs/archive/`.

**Dependencies:** Phase 3; a macOS host for complete acceptance of the fourth issue criterion.

**Risks:** Electron Packager can download a Darwin runtime on Linux, but Linux cannot provide authoritative macOS launch/signing validation.

**Acceptance criteria:** Another contributor can repeat the Linux build from a clean checkout, and macOS evidence is either complete or transparently marked as the only remaining external-host check.

## 5. Test strategy and acceptance-criteria mapping

| Issue criterion | Tasks | Verification |
| --- | --- | --- |
| Clean Linux checkout + frozen build produces a self-contained artifact without macOS tooling or missing assets | Phases 1–2 | Fresh checkout/temp worktree; `bun install --frozen-lockfile`; executable Electron version check; `bun run make:linux`; inspect one ZIP output |
| Unpacked artifact launches offline on Arch x86_64 as an ordinary user with sandboxing enabled | Phase 3 | Launch without `--no-sandbox`; capture logs/process args; offline create/edit/quit/relaunch smoke test |
| Artifact includes version metadata, runtime files, icon assets, and applicable license notices | Phases 1–3 | ZIP manifest; `app.asar` package metadata; PNG/ICNS validation; application/Electron/Chromium license assertions; SHA-256 record |
| Existing macOS packaging remains buildable | Phases 1, 2, 4 | Config/type checks and Darwin package generation where possible; full Darwin ZIP make on macOS before final acceptance |

## 6. Out-of-scope and deferred work

- #25 consumes the stable executable/icon identity to add launchers, file arguments, and optional Markdown associations.
- #26 consumes #25's installed launcher and app identity for Hyprland integration.
- #24 consumes the verified ZIP/unpacked payload, runtime dependency inventory, icon, and license to produce a `PKGBUILD` and private pacman upgrade path.
- #29 adds CI artifact builds, installed-package tests, and the long-term support guide only after #23 and #24 define what must be built and installed.
- ARM64 remains a separate target until independently built and validated.

## 7. Immediate next steps

1. Approve this plan and the ARC implementation contract/workload class.
2. Run an independent ARC Verify pass over the recovered implementation and recorded evidence.
3. Complete the ordinary-user GUI/offline persistence smoke test on a host that permits Chromium sandbox setup.
4. Complete the Darwin ZIP and launch checks on macOS; do not infer them from Linux configuration checks.
5. Only after explicit authorization, decide whether to commit or open a PR.
