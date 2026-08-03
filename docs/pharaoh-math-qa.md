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
