# Device Monitoring

Device Monitoring is a lightweight, self-hosted uptime monitor for devices on your network. It is inspired by the operational clarity of Uptime Kuma, but built as an original TypeScript/Fastify/React project with secure authentication, SQLite persistence, status-change notifications, and a small Docker deployment footprint.

## Features

- Secure username/password login with Argon2id password hashing.
- Multi-user accounts with admin/viewer roles; viewers get read-only access everywhere.
- HttpOnly session cookies and CSRF header protection for mutating API calls.
- Device inventory with host/IP, interval, timeout, retry count, and enabled flag.
- Ping, HTTP, TCP, DNS-resolution, and TLS-certificate-expiry checks, with beat history and latency tracking.
- Flap protection: a reachable device is only declared down after 3 rapid silent re-checks (2 s apart) all fail — one success cancels the alert.
- State-transition alerts for `up -> down`, `down -> up`, degraded (latency/cert-expiry threshold), and first known state.
- Maintenance windows per device that suppress alert noise (beats still recorded) and an on-demand incident timeline.
- Notification channels for Discord webhooks, Telegram bots, and generic webhooks, with secrets encrypted at rest (AES-256-GCM).
- Public, unauthenticated status page for devices explicitly marked public (off and empty by default).
- Prometheus-format `/metrics` endpoint, optionally bearer-token protected.
- Dashboard with up/down/unknown summary, recent beats, device table, and beat timeline.
- SQLite database stored in a Docker volume.
- GitHub Actions CI using free-tier features only: typecheck, lint, tests, Docker build.

## Quick start with Docker Compose

Create an environment file:

```bash
cp .env.example .env
```

Edit `.env` and set strong values:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=a-long-random-password-at-least-12-chars
COOKIE_SECRET=a-random-32-plus-character-secret-value
# generate with: openssl rand -base64 32 — keep it stable once channels exist
SECRET_ENCRYPTION_KEY=a-base64-encoded-32-byte-key
```

Start the app:

```bash
./scripts/up.sh --build
```

The script finds the first free host port in 3000–3100 (so a busy port 3000 never blocks startup — listeners from any process are detected, including containers started with `sudo docker`) and prints the URL it chose. Plain `docker compose up --build` still works and binds port 3000, or a specific port with `APP_PORT=3005 docker compose up --build`.

Open the printed URL (default [http://localhost:3000](http://localhost:3000)) and sign in with the admin credentials. The first admin user is created only when the database has no users. There is no default password.

> **Zero-config option:** if you skip the `.env` steps and just run `./scripts/up.sh --build -d`, the script creates `.env` from the template with freshly generated secrets and prints the one-time admin password. Save that password.

## Updating

To update an existing install to the latest version, run:

```bash
./scripts/update.sh
```

This fetches the latest code (`git pull`), rebuilds the image, and restarts the stack. Your data volume and `.env` are preserved, the host port stays the same, and database schema migrations run automatically on boot. If a required secret in `.env` is still blank or set to a placeholder value, the script fills it in with a strong generated value so the app starts cleanly (rotating `COOKIE_SECRET` does **not** log anyone out — sessions are stored server-side).

If you don't use git (e.g. you downloaded a snapshot), replace the files and run `./scripts/up.sh --build -d` instead — it performs the same secret-healing and restart.

## Development

Requirements:

- Node.js 22 LTS
- pnpm 9+
- `ping` executable available on the host for device checks

Install dependencies:

```bash
corepack enable
pnpm install
```

Run the API and web app:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=a-long-random-password COOKIE_SECRET=a-random-32-plus-character-secret pnpm dev
```

Useful commands:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
```

## Environment variables

| Variable           | Required        | Default                             | Description                                                             |
| ------------------ | --------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `ADMIN_USERNAME` | First boot only | none                                | Username for the first admin account. Required when there are no users. |
| `ADMIN_PASSWORD` | First boot only | none                                | Password for the first admin account. Must be at least 12 characters.   |
| `COOKIE_SECRET`  | Production      | development-only fallback           | Secret used to sign cookies. Use at least 32 random characters. Required in production; well-known placeholders are rejected. |
| `DATABASE_PATH`  | No              | `./data/device-monitoring.sqlite` | SQLite database path. Docker uses`/data/device-monitoring.sqlite`.    |
| `HOST`           | No              | `0.0.0.0`                         | API bind host.                                                          |
| `PORT`           | No              | `3000`                            | API/web port in production.                                             |
| `STATIC_DIR`     | No              | `./public`                        | Built frontend directory served by the API.                             |
| `BEAT_RETENTION_DAYS` | No         | `30`                               | Days of beat/notification-event history to keep.                       |
| `ENABLE_STATUS_PAGE` | No          | `false`                            | Enables `GET /api/status`. Devices must also be individually marked public. |
| `SECRET_ENCRYPTION_KEY` | Production | dev-only fallback              | Base64, 32 bytes, encrypts notification-channel secrets at rest. Generate with `openssl rand -base64 32`. |
| `ENABLE_METRICS` | No              | `false`                            | Enables the Prometheus-format `GET /metrics` endpoint.                  |
| `METRICS_TOKEN`  | No¹             | none                               | Bearer token required to scrape `/metrics` (constant-time compared). ¹Required in production when `ENABLE_METRICS=true`. |
| `TRUST_PROXY`    | No              | `false`                            | How much of `X-Forwarded-For` to trust for per-IP rate limits. Set only behind a trusted proxy: `true`=one hop, `<N>`=N hops, `<CIDR>`=trusted proxy nets. |

## Notification configuration examples

Discord:

```json
{
  "webhookUrl": "https://discord.com/api/webhooks/..."
}
```

Telegram:

```json
{
  "botToken": "123456:bot-token",
  "chatId": "123456789"
}
```

Generic webhook:

```json
{
  "url": "https://example.com/device-monitoring-hook"
}
```

Channel secrets are encrypted at rest with AES-256-GCM (key from `SECRET_ENCRYPTION_KEY`) and redacted from API responses and the UI. Keep the key stable and back it up alongside the database — without it, stored secrets cannot be decrypted.

## Architecture

```text
apps/web          React + Vite UI
apps/api          Fastify API, auth, scheduler, notification providers
packages/shared   Zod schemas and shared TypeScript types
/data             SQLite database volume in Docker
```

The monitoring scheduler runs inside the API process. Check logic (ping/HTTP/TCP/DNS/TLS), repositories, and notification providers are separated modules, so multi-worker scheduling or new check types can be added without rewriting the UI.

## CI/CD

The repository includes [.github/workflows/ci.yml](.github/workflows/ci.yml). Every push and pull request to `main` runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`
5. `docker build -t device-monitoring:ci .`

No GitHub Pro features are required.

## Security notes

- No default admin account or default password is shipped.
- Passwords are hashed with Argon2id.
- Sessions use HttpOnly cookies, `SameSite=Strict`, and `Secure` in production.
- Mutating API calls require `x-device-monitoring-csrf: 1`; authentication is enforced on the matched route (not the raw URL), so encoded-path tricks can't bypass it.
- Login is rate-limited to 5 attempts/min per IP (on top of the global 120/min); logins run in constant time so response timing doesn't reveal valid usernames.
- A strict Content-Security-Policy is applied (`script-src 'self'`, framing denied).
- Viewer accounts have read-only API access; only admins can write.
- Notification-channel secrets are encrypted at rest (AES-256-GCM) and redacted in API responses; outbound webhooks are blocked from reaching link-local / cloud-metadata addresses.
- Devices are private by default; the public status page only ever shows devices explicitly marked public.
- Run behind HTTPS in production; set `SECURE_COOKIES=true` and, if behind a reverse proxy, `TRUST_PROXY` (see the environment-variables table) so per-IP rate limits key on the real client IP.

## Roadmap

- OpenTelemetry export (Prometheus `/metrics` already available).
- Import/export and backup tooling.
- Recurring/multi-device maintenance windows.
- Public status page branding and multiple named status pages.
