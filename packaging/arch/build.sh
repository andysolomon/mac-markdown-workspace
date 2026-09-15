#!/usr/bin/env bash
#
# packaging/arch/build.sh — authenticated build helper for the private Arch
# PKGBUILD in this directory.
#
#   1. Verifies `gh auth status` includes the private repo (no token embedding).
#   2. Downloads the matching Linux ZIP from the private GitHub release.
#   3. Verifies the SHA-256 against the locked value in PKGBUILD.
#   4. Stages a clean makepkg build directory under /tmp and runs makepkg.
#
# Usage:
#   build.sh [--refresh] [--install]
#     --refresh   Recompute sha256sums in PKGBUILD from the downloaded ZIP
#     --install   Run `makepkg -si` to install (default: build only, -s)
#
# Required tooling (one-time setup):
#   pacman -S namcap                # for validation in docs
#   makepkg + pacman + gh           # standard on Omarchy / Arch

set -euo pipefail

PKGBUILD_DIR="$(cd "$(dirname "$0")" && pwd)"
PKGVER="1.0.0"
ZIP_NAME="mac-markdown-workspace-${PKGVER}-linux-x64.zip"
REPO="andysolomon/mac-markdown-workspace"
TAG="v${PKGVER}"

REFRESH=0
INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --refresh) REFRESH=1 ;;
    --install) INSTALL=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *)
      echo "build.sh: unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "build.sh: missing required tool: $1" >&2
    exit 1
  fi
}

require gh
require makepkg
require sha256sum

# 1. Confirm gh CLI is authenticated to the private repo scope.
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo "build.sh: gh is not authenticated; run \`gh auth login\` first." >&2
  exit 1
fi

# 2. Sanity check: PKGBUILD references the artifact we expect.
EXPECTED_SHA="$(grep -E "^sha256sums=" "${PKGBUILD_DIR}/PKGBUILD" \
  | sed -E "s/^sha256sums=\('([^']+)'\)/\1/")"
if [[ -z "${EXPECTED_SHA}" ]]; then
  echo "build.sh: cannot extract sha256 from PKGBUILD" >&2
  exit 1
fi

# 3. Resolve the artifact. Priority: --refresh flag uses any local ZIP in
#    the source tree; otherwise download from the private release.
WORK="$(mktemp -d -t macmd-pkgbuild-XXXXXX)"
trap 'rm -rf "${WORK}"' EXIT
ZIP_PATH="${WORK}/${ZIP_NAME}"

LOCAL_ZIP="${PKGBUILD_DIR}/${ZIP_NAME}"
if [[ ${REFRESH} -eq 1 && -f "${LOCAL_ZIP}" ]]; then
  echo "==> --refresh: reusing local ${LOCAL_ZIP}"
  cp -f "${LOCAL_ZIP}" "${ZIP_PATH}"
elif [[ -f "${LOCAL_ZIP}" ]]; then
  echo "==> Reusing local ${LOCAL_ZIP}"
  cp -f "${LOCAL_ZIP}" "${ZIP_PATH}"
else
  echo "==> Downloading ${ZIP_NAME} from ${REPO} ${TAG}"
  if ! gh release download "${TAG}" --repo "${REPO}" \
        --pattern "${ZIP_NAME}" --dir "${WORK}" --clobber >/dev/null 2>&1; then
    echo "build.sh: private release download failed." >&2
    echo "            Ensure the tag '${TAG}' exists in ${REPO} and your gh" >&2
    echo "            account has the 'repo' scope. Public AUR is not used." >&2
    exit 1
  fi
fi

# 4. SHA-256 verification.
ACTUAL_SHA="$(sha256sum "${ZIP_PATH}" | awk '{print $1}')"
if [[ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]]; then
  if [[ ${REFRESH} -eq 1 ]]; then
    echo "==> sha256 mismatch — refreshing PKGBUILD from downloaded artifact"
    sed -i -E "s|^sha256sums=\('[^']+'\)|sha256sums=('${ACTUAL_SHA}')|" \
      "${PKGBUILD_DIR}/PKGBUILD"
    EXPECTED_SHA="${ACTUAL_SHA}"
  else
    echo "build.sh: sha256 mismatch (got ${ACTUAL_SHA}, expected ${EXPECTED_SHA})." >&2
    echo "            Re-run with --refresh after regenerating the artifact." >&2
    exit 1
  fi
fi

# 5. Stage a clean build dir under /tmp so we don't litter the source tree.
BUILD_DIR="${WORK}/build"
mkdir -p "${BUILD_DIR}"
cp -f "${PKGBUILD_DIR}/PKGBUILD" "${BUILD_DIR}/PKGBUILD"
cp -f "${ZIP_PATH}" "${BUILD_DIR}/${ZIP_NAME}"
echo "==> Staged build at ${BUILD_DIR}"

# 6. Run makepkg. -s syncs makedepends, --nocheck skips optdepends tests.
pushd "${BUILD_DIR}" >/dev/null
if [[ ${INSTALL} -eq 1 ]]; then
  makepkg -si --nocheck
else
  makepkg --nocheck
  PKG="$(ls *.pkg.tar.zst 2>/dev/null || true)"
  if [[ -n "${PKG}" ]]; then
    echo "==> Built: ${BUILD_DIR}/${PKG}"
  fi
fi
popd >/dev/null
