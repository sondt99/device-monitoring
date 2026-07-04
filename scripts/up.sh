#!/usr/bin/env bash
# Start (or update) the stack. On a fresh machine it bootstraps .env with
# generated secrets and picks a free host port; on later runs it reuses that
# same port and heals any blank/placeholder/missing secrets, so upgrading an
# existing install "just works" without hand-editing .env.
#
# Port range override: APP_PORT_START / APP_PORT_END. Pin a port with APP_PORT.
#
# Usage: ./scripts/up.sh [docker compose up args, e.g. --build -d]
set -euo pipefail
cd "$(dirname "$0")/.."

gen_secret() { openssl rand -base64 32; }

# Read a KEY's value from .env (everything after the first '='); empty if absent.
env_value() { [ -f .env ] && sed -n "s|^$1=||p" .env | head -n1 || true; }

# Replace KEY's value in .env, or append the line if the key is absent.
# base64 secrets contain / + = but never '|', so '|' is a safe sed delimiter.
set_env() {
  local key="$1" val="$2"
  if [ -f .env ] && grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    printf '%s=%s\n' "$key" "$val" >>.env
  fi
}

# ── first-run bootstrap (on a fresh machine .env doesn't exist; it's gitignored)
if [ ! -f .env ]; then
  cp .env.example .env
  ADMIN_PW="$(gen_secret)"
  set_env ADMIN_PASSWORD "$ADMIN_PW"
  set_env COOKIE_SECRET "$(gen_secret)"
  set_env SECRET_ENCRYPTION_KEY "$(gen_secret)"
  echo "==> no .env found — created one from .env.example with generated secrets" >&2
  echo "    first-boot admin login:  username: admin   password: $ADMIN_PW" >&2
  echo "    (save that password now, or edit .env before this first start)" >&2
fi

# ── heal secrets so an existing install survives upgrades ───────────────────
# COOKIE_SECRET: production now refuses to boot on a blank / placeholder /
# too-short value. Regenerate any such value — safe, because sessions are
# stored server-side (not signed into the cookie), so rotating it logs nobody out.
COOKIE="$(env_value COOKIE_SECRET)"
NEED_COOKIE=0
case "$COOKIE" in
  '' | 'change-this-to-a-random-32-plus-character-secret' | 'development-cookie-secret-change-me-32bytes')
    NEED_COOKIE=1 ;;
  *) [ "${#COOKIE}" -lt 32 ] && NEED_COOKIE=1 || true ;;
esac
if [ "$NEED_COOKIE" = 1 ]; then
  set_env COOKIE_SECRET "$(gen_secret)"
  echo "==> set a strong COOKIE_SECRET in .env (previous value was blank/placeholder/too short)" >&2
fi

# SECRET_ENCRYPTION_KEY: required in production; fill it if blank or missing.
if [ -z "$(env_value SECRET_ENCRYPTION_KEY)" ]; then
  set_env SECRET_ENCRYPTION_KEY "$(gen_secret)"
  echo "==> generated missing SECRET_ENCRYPTION_KEY in .env (keep it stable from now on)" >&2
fi

# TRUST_PROXY: newer knob — add it with a safe default so it's discoverable.
grep -qE '^TRUST_PROXY=' .env || set_env TRUST_PROXY false

# Metrics without a token refuses to boot in production — warn early and clearly.
if [ "$(env_value ENABLE_METRICS)" = 'true' ] && [ -z "$(env_value METRICS_TOKEN)" ]; then
  echo "WARNING: ENABLE_METRICS=true but METRICS_TOKEN is empty — the app will refuse to" >&2
  echo "         start in production. Set METRICS_TOKEN in .env, or set ENABLE_METRICS=false." >&2
fi

# docker compose treats a raw '$' inside .env values as a variable reference
# and silently replaces it with an empty string, mangling the value.
# Escaped '$$' pairs are stripped before checking so they don't false-alarm.
RAW_DOLLAR_LINES="$(awk -F= 'NF>1 && $0 !~ /^[ \t]*#/ { v=$0; gsub(/\$\$/,"",v); if (v ~ /\$/) printf "%d ", NR }' .env)"
if [ -n "$RAW_DOLLAR_LINES" ]; then
  echo "WARNING: .env line(s) $RAW_DOLLAR_LINES contain a raw '\$' — docker compose" >&2
  echo "         treats it as a variable reference and blanks it out, mangling the" >&2
  echo "         value. Escape each '\$' as '\$\$', or use a value without '\$'." >&2
fi

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
if [ -n "$USE_SUDO" ]; then DC="sudo docker compose"; else DC="docker compose"; fi

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

# Host port precedence: explicit APP_PORT env > APP_PORT saved in .env > the
# port our already-running container uses > first free port in the range. Once
# chosen it's persisted to .env, so restarts and updates keep the same port
# (a running container would otherwise look "busy" and make the port drift).
APP_PORT="${APP_PORT:-$(env_value APP_PORT)}"
if [ -z "$APP_PORT" ]; then
  APP_PORT="$($DC port device-monitoring 3000 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n1 || true)"
  if [ -n "$APP_PORT" ]; then
    echo "==> reusing the port the running container already publishes: $APP_PORT" >&2
  else
    for port in $(seq "$START_PORT" "$END_PORT"); do
      if port_in_use "$port"; then
        echo "port $port is busy, trying $((port + 1))..." >&2
        continue
      fi
      APP_PORT="$port"
      break
    done
  fi
  if [ -z "$APP_PORT" ]; then
    echo "error: no free port found in $START_PORT-$END_PORT" >&2
    exit 1
  fi
  set_env APP_PORT "$APP_PORT"
  echo "==> host port $APP_PORT saved to .env (restarts and updates will keep it)" >&2
fi

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "==> starting device-monitoring (bound to 0.0.0.0 — reachable from the LAN):"
echo "      local:   http://localhost:$APP_PORT"
if [ -n "$LAN_IP" ]; then
  echo "      network: http://$LAN_IP:$APP_PORT"
fi
echo "    (host port $APP_PORT maps to port 3000 inside the container —"
echo "     the app's own logs will always say 3000; that is expected)"
if [ -n "$USE_SUDO" ]; then
  # `sudo VAR=value cmd` keeps the variable despite sudo's env_reset.
  exec sudo APP_PORT="$APP_PORT" docker compose up "$@"
fi
APP_PORT="$APP_PORT" exec docker compose up "$@"
