#!/usr/bin/env bash
# One-command update for an existing install: fetch the latest code, then
# rebuild and restart the stack. Your data volume and .env are preserved, the
# host port stays the same, and any blank/placeholder secrets are healed by
# up.sh. Database schema migrations run automatically on boot.
#
# Usage: ./scripts/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> updating device-monitoring"

if [ -d .git ] && command -v git >/dev/null 2>&1; then
  echo "==> fetching latest code (git pull --ff-only)"
  if ! git pull --ff-only; then
    echo "error: 'git pull --ff-only' failed — you likely have local edits or a" >&2
    echo "       diverged branch. Run 'git stash' (or commit your changes) and retry." >&2
    exit 1
  fi
else
  echo "==> not a git checkout — skipping code fetch, rebuilding the current files" >&2
fi

echo "==> rebuilding image and restarting (data volume + .env are kept)"
exec ./scripts/up.sh --build -d
