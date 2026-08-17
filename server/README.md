# Mirage backend foundation

This directory contains the first server-authoritative layer for Mirage:

- Telegram Mini App `initData` validation;
- opaque server sessions;
- PostgreSQL players, wallets and immutable ledger;
- idempotent round reservation and settlement contract;
- referral, streak and demo persistence foundations;
- tests for authentication, max-win validation and duplicate round protection.

The game engine is intentionally disabled. `POST /v1/games/rounds` returns `ROUND_ENGINE_NOT_READY` before any funds are reserved. The next backend pass must port and test each room's RNG/math before enabling this endpoint.

## Local setup

Requirements: Node.js 22+ and PostgreSQL 15+.

```powershell
cd server
pnpm install
psql $env:DATABASE_URL -f sql/001_initial.sql
$env:DATABASE_URL = "postgresql://mirage:mirage@127.0.0.1:5432/mirage"
$env:TELEGRAM_BOT_TOKEN = "<bot token>"
$env:CORS_ORIGIN = "https://john1424-creat.github.io"
pnpm test
pnpm start
```

Do not commit a real bot token or database URL. Production must terminate TLS at the platform/load balancer and connect to PostgreSQL with certificate verification.

## Implemented endpoints

```text
GET  /health
POST /v1/auth/telegram
GET  /v1/account
GET  /v1/ledger?limit=50
POST /v1/games/rounds
GET  /v1/games/rounds/:roundId
```

Authenticated requests use `Authorization: Bearer <opaque session token>`. Money-changing POST requests require `Idempotency-Key`.

## Production gates

1. Choose a backend host and managed PostgreSQL region.
2. Add migrations and integration tests against an isolated PostgreSQL database.
3. Port Pyramid RNG/math and run statistical regression tests.
4. Port Carpet RNG/math and deterministic round recovery.
5. Port Pharaoh cascades, free spins and bonus sessions.
6. Add deposit/withdraw provider webhooks and reconciliation.
7. Add rate limiting, structured audit logs, monitoring and backups.
8. Complete jurisdiction-specific licensing, security and mathematical review.

Telegram validation follows the official Mini Apps algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
