# Mirage backend foundation

This directory contains the first server-authoritative layer for Mirage:

- Telegram Mini App `initData` validation;
- opaque server sessions;
- PostgreSQL players, wallets and immutable ledger;
- idempotent atomic round settlement contract;
- referral, streak and demo persistence foundations;
- a server-authoritative Pyramid round engine using cryptographic RNG;
- tests for authentication, max-win validation, duplicate round protection and Pyramid RTP invariants.

The Pyramid engine is enabled. Carpet and Pharaoh still return `ROOM_ENGINE_NOT_READY` before any funds are changed. The browser prototype remains client-driven until the API integration pass is completed.

## Local setup

Requirements: Node.js 22+ and PostgreSQL 15+.

```powershell
cd server
pnpm install
psql $env:DATABASE_URL -f sql/001_initial.sql
psql $env:DATABASE_URL -f sql/002_round_request.sql
$env:DATABASE_URL = "postgresql://mirage:mirage@127.0.0.1:5432/mirage"
$env:TELEGRAM_BOT_TOKEN = "<bot token>"
$env:CORS_ORIGIN = "https://john1424-creat.github.io"
pnpm test
pnpm simulate:pyramid
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

Pyramid round request:

```json
{
  "room": "pyramid",
  "walletType": "demo",
  "stake": 10,
  "configuration": {
    "rows": 13,
    "risk": "medium"
  }
}
```

The server chooses the target slot, calculates the payout and returns a visual path ending in that slot. The client must animate the supplied outcome and must not recalculate it. The round, wallet update and ledger entries are committed in one PostgreSQL transaction. Repeating the same `Idempotency-Key` returns the original round; reusing it with different parameters returns `IDEMPOTENCY_CONFLICT`.

Authenticated requests use `Authorization: Bearer <opaque session token>`. Money-changing POST requests require `Idempotency-Key`.

## Production gates

1. Choose a backend host and managed PostgreSQL region.
2. Add migrations and integration tests against an isolated PostgreSQL database.
3. Run Pyramid PostgreSQL integration tests and connect the Telegram client to its round API.
4. Port Carpet RNG/math and deterministic round recovery.
5. Port Pharaoh cascades, free spins and bonus sessions.
6. Add deposit/withdraw provider webhooks and reconciliation.
7. Add rate limiting, structured audit logs, monitoring and backups.
8. Complete jurisdiction-specific licensing, security and mathematical review.

Telegram validation follows the official Mini Apps algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
