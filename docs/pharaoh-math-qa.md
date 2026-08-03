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

## Telegram 227 transparent multiplier pass

The visible multiplier mechanic now matches the calculation contract:

- multiplier symbols display one of `x2`, `x3`, `x5` or `x10`;
- a multiplier is added only when the same cascade contains a paying cluster;
- the free-spin bank starts at `x1`, persists between free spins and is capped
  at `x10`;
- the current bank is shown in the existing status line, so the grid and genie
  panel keep their approved dimensions;
- base payout scale: `8.54`;
- free-spin payout scale: `2.47`.

The final calibration used several independent seeded runs because the bonus
round has high variance. Across approximately 2.5 million paid rounds the
normalized total RTP was about `95.05%`. Across at least 150,000 bonus-buy
sessions the normalized bonus-buy RTP was about `95.1%`. These browser results
are regression targets, not a substitute for certified server-side math.

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
