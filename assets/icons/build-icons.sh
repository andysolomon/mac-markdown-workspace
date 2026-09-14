#!/usr/bin/env bash
# Regenerates the tracked raster icons from the canonical icon.svg.
#
#   assets/icons/icon.png   512x512 RGBA PNG  (Linux / Electron Packager linux target)
#   assets/icons/icon.icns  multi-size ICNS   (macOS / Electron Packager darwin target)
#
# Requirements: rsvg-convert (librsvg) and python3. No ImageMagick ICNS writer or
# macOS iconutil is needed: the ICNS container is assembled directly from PNG
# payloads, which macOS accepts for every size from 16px to 1024px.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

rsvg-convert -w 512 -h 512 "$here/icon.svg" -o "$here/icon.png"

for size in 16 32 64 128 256 512 1024; do
  rsvg-convert -w "$size" -h "$size" "$here/icon.svg" -o "$tmp/icon_${size}.png"
done

python3 - "$tmp" "$here/icon.icns" <<'PY'
import struct, sys, pathlib
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
# ICNS element types that accept PNG payloads (Apple Icon Image format).
types = [
    (b"icp4", 16), (b"icp5", 32), (b"icp6", 64), (b"ic07", 128), (b"ic08", 256),
    (b"ic09", 512), (b"ic10", 1024), (b"ic11", 32), (b"ic12", 64), (b"ic13", 256),
    (b"ic14", 512),
]
body = b""
for tag, size in types:
    data = (src / f"icon_{size}.png").read_bytes()
    body += tag + struct.pack(">I", 8 + len(data)) + data
out.write_bytes(b"icns" + struct.pack(">I", 8 + len(body)) + body)
print(f"wrote {out} ({8 + len(body)} bytes, {len(types)} elements)")
PY
