# Device Monitoring

Device Monitoring is a lightweight, self-hosted uptime monitor for devices on your network. It is inspired by the operational clarity of Uptime Kuma, but built as an original TypeScript/Fastify/React project with secure authentication, SQLite persistence, status-change notifications, and a small Docker deployment footprint.

## Features

- Secure username/password login with Argon2id password hashing.
- HttpOnly session cookies and CSRF header protection for mutating API calls.
- Device inventory with host/IP, interval, timeout, retry count, and enabled flag.
- Periodic ping checks with beat history and latency tracking.
- State-transition alerts for `up -> down`, `down -> up`, and first known state.
- Notification channels for Discord webhooks, Telegram bots, and generic webhooks.
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
```

Start the app:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the admin credentials. The first admin user is created only when the database has no users. There is no default password.

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
| `COOKIE_SECRET`  | Production      | development-only fallback           | Secret used to sign cookies. Use at least 32 random characters.         |
| `DATABASE_PATH`  | No              | `./data/device-monitoring.sqlite` | SQLite database path. Docker uses`/data/device-monitoring.sqlite`.    |
| `HOST`           | No              | `0.0.0.0`                         | API bind host.                                                          |
| `PORT`           | No              | `3000`                            | API/web port in production.                                             |
| `STATIC_DIR`     | No              | `./public`                        | Built frontend directory served by the API.                             |

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

Secrets are stored in SQLite for the MVP and redacted from API responses and UI. For high-security deployments, mount the SQLite volume on encrypted storage and restrict filesystem access.

## Architecture

```text
apps/web          React + Vite UI
apps/api          Fastify API, auth, scheduler, notification providers
packages/shared   Zod schemas and shared TypeScript types
/data             SQLite database volume in Docker
```

The monitoring scheduler runs inside the API process for the MVP. Check logic, repositories, and notification providers are separated so HTTP/TCP/DNS checks, multi-worker scheduling, and encrypted secret storage can be added later without rewriting the UI.

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
- Mutating API calls require `x-device-monitoring-csrf: 1`.
- Login and API routes are rate-limited.
- Notification secrets are redacted in API responses.
- Run behind HTTPS in production; cookie `Secure` mode expects TLS at the browser edge.

## Roadmap

- HTTP, TCP, DNS, and TLS certificate checks.
- Public status pages.
- Multi-user accounts and RBAC.
- Prometheus/OpenTelemetry export.
- Secret encryption at rest.
- Incident timelines and maintenance windows.
- Import/export and backup tooling.
