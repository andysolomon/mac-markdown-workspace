#!/usr/bin/env bash
# Confirm the committed .SRCINFO matches `makepkg --printsrcinfo`.
#
# makepkg exits 10 when EUID is 0 ("Running makepkg as root is not allowed").
# GitHub Actions' archlinux job container is root, so re-exec as `builder`.
set -euo pipefail

cd "$(dirname "$0")"

if [[ "$(id -u)" -eq 0 ]]; then
  if ! id builder >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash builder
  fi
  chown -R builder:builder .
  exec su builder -s /bin/bash -c "set -euo pipefail; cd $(printf '%q' "$PWD"); makepkg --printsrcinfo > computed.SRCINFO; diff -u .SRCINFO computed.SRCINFO; rm computed.SRCINFO"
fi

makepkg --printsrcinfo > computed.SRCINFO
diff -u .SRCINFO computed.SRCINFO
rm computed.SRCINFO
