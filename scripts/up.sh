#!/usr/bin/env bash
# Start the stack, automatically picking the first free host port in
# 3000-3100 (override the range with APP_PORT_START / APP_PORT_END).
#
# Port occupancy is checked at the kernel level, so listeners owned by ANY
# process are seen — containers started via `sudo docker` (rootful daemon),
# rootless docker, or a plain `pnpm dev` all show up in the same check.
#
# Usage: ./scripts/up.sh [docker compose up args, e.g. --build -d]
set -euo pipefail
cd "$(dirname "$0")/.."

# Fall back to sudo automatically when the current user can't reach the
# Docker socket (i.e. isn't in the `docker` group).
USE_SUDO=""
if ! docker info >/dev/null 2>&1; then
  echo "==> current user can't reach the Docker socket — retrying with sudo." >&2
  echo "    (permanent fix: sudo usermod -aG docker $USER, then log out and back in)" >&2
  if sudo docker info >/dev/null 2>&1; then
    USE_SUDO="1"
  else
    echo "error: Docker daemon unreachable even with sudo — is it running?" >&2
    exit 1
  fi
fi

START_PORT="${APP_PORT_START:-3000}"
END_PORT="${APP_PORT_END:-3100}"

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    [ -n "$(ss -Hltn "sport = :$port" 2>/dev/null)" ]
  else
    # Fallback: a successful TCP connect means something is listening.
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && { exec 3>&- || true; return 0; } || return 1
  fi
}

APP_PORT=""
for port in $(seq "$START_PORT" "$END_PORT"); do
  if port_in_use "$port"; then
    echo "port $port is busy, trying $((port + 1))..." >&2
    continue
  fi
  APP_PORT="$port"
  break
done

if [ -z "$APP_PORT" ]; then
  echo "error: no free port found in $START_PORT-$END_PORT" >&2
  exit 1
fi

echo "==> starting device-monitoring on http://localhost:$APP_PORT"
echo "    (host port $APP_PORT is mapped to port 3000 inside the container —"
echo "     the app's own logs will always say 3000; that is expected)"
if [ -n "$USE_SUDO" ]; then
  # `sudo VAR=value cmd` keeps the variable despite sudo's env_reset.
  exec sudo APP_PORT="$APP_PORT" docker compose up "$@"
fi
APP_PORT="$APP_PORT" exec docker compose up "$@"
