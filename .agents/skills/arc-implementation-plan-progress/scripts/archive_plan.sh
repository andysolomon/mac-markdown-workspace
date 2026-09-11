#!/usr/bin/env bash
set -euo pipefail

# Move a completed implementation plan and its progress tracker into docs/archive/.
# Usage: archive_plan.sh <plan-file> <progress-file> [archive-dir]
# Uses `git mv` inside a git repo (falls back to plain mv otherwise).

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 <plan-file> <progress-file> [archive-dir]" >&2
  exit 1
fi

PLAN_FILE="$1"
PROGRESS_FILE="$2"
ARCHIVE_DIR="${3:-docs/archive}"

for f in "$PLAN_FILE" "$PROGRESS_FILE"; do
  if [[ ! -f "$f" ]]; then
    echo "File not found: $f" >&2
    exit 1
  fi
done

mkdir -p "$ARCHIVE_DIR"

move() {
  local src="$1"
  local dest="$ARCHIVE_DIR/$(basename "$src")"
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git ls-files --error-unmatch "$src" >/dev/null 2>&1; then
    git mv -f "$src" "$dest"
  else
    mv -f "$src" "$dest"
  fi
  echo "Archived $src -> $dest"
}

move "$PLAN_FILE"
move "$PROGRESS_FILE"
