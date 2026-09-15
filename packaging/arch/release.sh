#!/usr/bin/env bash
#
# packaging/arch/release.sh — operator-only helper for cutting a private Arch
# release. NOT wired into CI yet; that belongs to #29.
#
# Steps:
#   1. `bun run make:linux` to rebuild the Linux Electron x64 ZIP.
#   2. Verify the freshly built artifact matches the sha256 in PKGBUILD; if
#      not, refuse to publish (the operator must regenerate PKGBUILD first).
#   3. Create the GitHub release tag if missing and upload the ZIP +
#      SHA256SUMS manifest.
#
# Usage:
#   release.sh [pkgver]
#     pkgver defaults to 1.0.0 (must match package.json)
#
# This script is idempotent: re-running after a partial upload will overwrite
# the existing asset (gh release upload --clobber).

set -euo pipefail

REPO="andysolomon/mac-markdown-workspace"
PKGVER="${1:-1.0.0}"
TAG="v${PKGVER}"
ASSET_BASE="mac-markdown-workspace-${PKGVER}-linux-x64"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "release.sh: missing required tool: $1" >&2
    exit 1
  fi
}

require gh
require bun
require sha256sum
require grep
require sed

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo "release.sh: gh is not authenticated; run \`gh auth login\` first." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT}"

# 1. Rebuild the Linux ZIP from the local checkout.
echo "==> Running: bun run make:linux (pkgver ${PKGVER})"
bun run make:linux >/dev/null

# 2. Locate the artifact. electron-forge names it with spaces.
ORIGINAL="$(ls out/make/zip/linux/x64/'Mac Markdown Workspace-linux-x64-'${PKGVER}'.zip' 2>/dev/null || true)"
if [[ -z "${ORIGINAL}" ]]; then
  echo "release.sh: expected forge artifact not found in out/make/zip/linux/x64/" >&2
  exit 1
fi

# 3. Stage a release-friendly name.
WORK="$(mktemp -d -t macmd-release-XXXXXX)"
trap 'rm -rf "${WORK}"' EXIT
RENAME="${WORK}/${ASSET_BASE}.zip"
cp -f "${ORIGINAL}" "${RENAME}"
ACTUAL_SHA="$(sha256sum "${RENAME}" | awk '{print $1}')"

# 4. Refuse to publish if the artifact sha256 doesn't match PKGBUILD.
PKGBUILD_SHA="$(grep -E '^sha256sums=' packaging/arch/PKGBUILD \
  | sed -E "s/^sha256sums=\('([^']+)'\)/\1/")"
if [[ "${ACTUAL_SHA}" != "${PKGBUILD_SHA}" ]]; then
  echo "release.sh: new artifact sha256 (${ACTUAL_SHA}) does not match PKGBUILD (${PKGBUILD_SHA})." >&2
  echo "             Update PKGBUILD and run packaging/arch/build.sh --refresh first." >&2
  exit 1
fi

# 5. Build a SHA256SUMS manifest alongside the artifact (one file per artifact).
SUMS="${WORK}/SHA256SUMS"
{
  printf '%s *%s\n' "${ACTUAL_SHA}" "${ASSET_BASE}.zip"
} > "${SUMS}"

# 6. Ensure the tag exists (without rebuilding previous artifacts).
if ! gh release view "${TAG}" --repo "${REPO}" >/dev/null 2>&1; then
  echo "==> Creating private release ${TAG}"
  gh release create "${TAG}" \
    --repo "${REPO}" \
    --target "$(git rev-parse HEAD)" \
    --title "Mac Markdown Workspace ${PKGVER}" \
    --notes "Private Linux x64 release for the Mac Markdown Workspace.

This binary is for use only by authenticated members of the repo
${REPO}. No public AUR publication occurs from this tag." >/dev/null
fi

# 7. Upload (idempotent due to --clobber).
echo "==> Uploading ${ASSET_BASE}.zip + SHA256SUMS to ${TAG}"
gh release upload "${TAG}" "${RENAME}" "${SUMS}" --repo "${REPO}" --clobber >/dev/null

# 8. Surface the canonical artifact URL so build.sh can download it.
echo "==> https://github.com/${REPO}/releases/download/${TAG}/${ASSET_BASE}.zip"
echo "==> sha256: ${ACTUAL_SHA}"
