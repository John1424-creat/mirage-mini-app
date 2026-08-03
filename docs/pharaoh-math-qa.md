# Pharaoh math QA

Baseline for the Telegram 226 mechanics pass.

## Production parameters

- Target RTP: `95%`
- Grid: `6 x 5`, anywhere pays from 8 matching symbols
- Base payout scale: `8.5`
- Free-spin payout scale: `1.25`
- Scatter weight: `2.4`
- Scatter award: 4 = 10 FS, 5 = 12 FS, 6+ = 15 FS
- Bonus buy: 15 FS for `10 x stake`
- Bonus-buy price limit: `20%` of the `$5,000` room pool
- Persistent free-spin multiplier bank: capped at `x10`
- Bonus-session safety limit: 100 spins including retriggers
- Maximum win: `10,000 x stake`

## Reproducible simulation

Seed: `226`

```powershell
node tools/slot-simulator.mjs 1000000 base 226
node tools/slot-simulator.mjs 100000 bonus-buy 226
```

### One million paid base rounds

- Total RTP: `95.09465%`
- Base-game contribution: `89.79881%`
- Natural free-spin contribution: `5.29584%`
- Hit rate: `25.71%`
- Free-spin trigger rate: `0.9555%` (about 1 in 105 paid spins)
- Average spins per natural bonus: `11.46` including retriggers
- Maximum observed win: `104.7 x stake`
- 99th percentile: `12.8 x stake`

### One hundred thousand bonus buys

- Bonus-buy RTP: `95.04882%`
- Average spins: `16.62` including retriggers
- Retriggers: `15,625`
- Maximum observed win: `80.1 x stake`

## UI lifecycle check

At stake 10, a bonus buy charged 100 once, then played the sequence as
`15 -> 14 -> ... -> 0`. The buy control remained disabled while the session
was active, the persistent multiplier bank survived between free spins, the
session result was credited once, and controls returned to the ready state.

## Production backend gate

The current browser implementation is a prototype. Real-money release is
blocked until the following logic becomes server-authoritative:

- authenticated round creation and an idempotent wallet debit;
- cryptographically secure or independently certified RNG;
- versioned math configuration and immutable mapping from RNG input to outcome;
- server-side cascade, scatter, multiplier, retrigger and max-win calculation;
- signed round response consumed by the client only as an animation script;
- atomic settlement, round ledger, audit identifiers and reconciliation;
- interrupted-round recovery, including an unfinished free-spin session;
- statistical RNG and game-math certification for the target jurisdiction.

The client must never be authoritative for the outcome, balance, payout or
remaining bonus spins.

## Competitive gap audit

### Required before closing Pharaoh

- Show the numeric value on every multiplier symbol instead of a generic `X`.
- Add a persistent total-multiplier meter during free spins.
- Resolve the current presentation mismatch: the multiplier table contains
  `x25` and `x50`, while the accumulated bank is capped at `x10`.
- Explain retriggers and the persistent multiplier in the rules panel.
- Add scatter anticipation before the fourth triggering symbol.

### Product polish

- Layered sound design and Telegram haptics for drop, cascade, multiplier,
  scatter, retrigger and win tiers, with independent mute controls.
- A speed mode and a safe tap-to-skip option for long win ceremonies without
  changing the result or settlement timing.
- A readable round-history entry with stake, cascades, multiplier, payout and
  round identifier.
- Reduced-motion and low-power modes that preserve information hierarchy.

### Backend phase

- Persist balance, current room, auto-play state and unfinished bonus sessions.
- Add round IDs, transaction IDs, server timestamps and replayable outcomes.
- Enforce stake, bonus-buy and exposure limits on the server.
