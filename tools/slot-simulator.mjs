const config = {
  targetRtp: 0.95,
  payoutScale: 8.54,
  freeSpinPayoutScale: 2.47,
  columns: 6,
  rows: 5,
  minWinCount: 8,
  maxWinMultiplier: 10000,
  stake: 10,
  maxBonusSpinsPerRound: 100,
  bonusBuy: {
    costMultiplier: 10,
    freeSpins: 15,
  },
  freeSpinMultiplier: {
    maxBank: 10,
    requiresWinningCascade: true,
    values: [
      { value: 2, weight: 68 },
      { value: 3, weight: 18 },
      { value: 5, weight: 9 },
      { value: 10, weight: 5 },
    ],
  },
  symbols: [
    { id: "pharaoh", weight: 4.4 },
    { id: "lamp", weight: 5.2 },
    { id: "ruby", weight: 6.4 },
    { id: "scarab", weight: 8.2 },
    { id: "scroll", weight: 9.4 },
    { id: "ankh", weight: 10.2 },
    { id: "coin", weight: 12.5 },
    { id: "blue", weight: 12.8 },
    { id: "green", weight: 13.2 },
    { id: "scatter", weight: 2.4 },
    { id: "multi", weight: 0.55 },
  ],
  payouts: {
    pharaoh: { 8: 0.5, 10: 1.2, 12: 2.5, 15: 8, 20: 28 },
    lamp: { 8: 0.45, 10: 1.0, 12: 2.2, 15: 7, 20: 22 },
    ruby: { 8: 0.4, 10: 0.9, 12: 1.8, 15: 5.5, 20: 18 },
    scarab: { 8: 0.32, 10: 0.7, 12: 1.4, 15: 4.2, 20: 12 },
    scroll: { 8: 0.26, 10: 0.55, 12: 1.1, 15: 3.2, 20: 9 },
    ankh: { 8: 0.22, 10: 0.5, 12: 1.0, 15: 2.8, 20: 7.5 },
    coin: { 8: 0.18, 10: 0.38, 12: 0.75, 15: 2.2, 20: 5.5 },
    blue: { 8: 0.16, 10: 0.34, 12: 0.68, 15: 2.0, 20: 5.0 },
    green: { 8: 0.15, 10: 0.3, 12: 0.62, 15: 1.8, 20: 4.5 },
  },
};

const numericOverride = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

config.payoutScale = numericOverride("SIM_PAYOUT_SCALE", config.payoutScale);
config.freeSpinPayoutScale = numericOverride("SIM_FREE_PAYOUT_SCALE", config.freeSpinPayoutScale);
config.symbols.find((symbol) => symbol.id === "scatter").weight = numericOverride(
  "SIM_SCATTER_WEIGHT",
  config.symbols.find((symbol) => symbol.id === "scatter").weight
);
if (process.env.SIM_MULTI_REQUIRES_WIN) {
  config.freeSpinMultiplier.requiresWinningCascade = process.env.SIM_MULTI_REQUIRES_WIN === "1";
}

let random = Math.random;

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedSymbol(context = "base") {
  const boost = context === "free" ? 1.7 : 1;
  const symbols = config.symbols.map((symbol) =>
    symbol.id === "multi" ? { ...symbol, weight: symbol.weight * boost } : symbol
  );
  const total = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  let roll = random() * total;
  for (const symbol of symbols) {
    roll -= symbol.weight;
    if (roll <= 0) return symbol.id;
  }
  return symbols[symbols.length - 1].id;
}

function createGrid(context = "base") {
  return Array.from({ length: config.rows }, () =>
    Array.from({ length: config.columns }, () => createCell(context))
  );
}

function freeSpinMultiplierValue() {
  const table = config.freeSpinMultiplier.values;
  const total = table.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of table) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return table[table.length - 1].value;
}

function baseMultiplierValue() {
  return 2 + Math.floor(random() * 4);
}

function cellSymbolId(cellValue) {
  return String(cellValue || "").split(":", 1)[0];
}

function cellMultiplierValue(cellValue) {
  if (cellSymbolId(cellValue) !== "multi") return 0;
  const value = Number(String(cellValue).split(":")[1]);
  return Number.isFinite(value) ? value : 0;
}

function createCell(context = "base") {
  const symbolId = weightedSymbol(context);
  if (symbolId !== "multi") return symbolId;
  const value = context === "free" ? freeSpinMultiplierValue() : baseMultiplierValue();
  return `multi:${value}`;
}

function payoutMultiplier(symbolId, count, payoutScale = config.payoutScale) {
  const table = config.payouts[symbolId];
  if (!table) return 0;
  return Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
    .reduce((value, threshold) => (count >= threshold ? table[threshold] : value), 0) * payoutScale;
}

function evaluate(grid, payoutScale = config.payoutScale) {
  const counts = new Map();
  const positions = new Map();
  let scatterCount = 0;
  let multiplierCount = 0;
  const multiplierValues = [];

  grid.forEach((row, rowIndex) => {
    row.forEach((cellValue, colIndex) => {
      const symbolId = cellSymbolId(cellValue);
      if (symbolId === "scatter") {
        scatterCount += 1;
        return;
      }
      if (symbolId === "multi") {
        multiplierCount += 1;
        multiplierValues.push({ key: `${rowIndex}-${colIndex}`, value: cellMultiplierValue(cellValue) });
        return;
      }
      counts.set(symbolId, (counts.get(symbolId) || 0) + 1);
      if (!positions.has(symbolId)) positions.set(symbolId, []);
      positions.get(symbolId).push(`${rowIndex}-${colIndex}`);
    });
  });

  const wins = [];
  counts.forEach((count, symbolId) => {
    if (count < config.minWinCount) return;
    const multiplier = payoutMultiplier(symbolId, count, payoutScale);
    if (multiplier <= 0) return;
    wins.push({ symbolId, count, multiplier, keys: positions.get(symbolId) || [] });
  });

  return { wins, scatterCount, multiplierCount, multiplierValues };
}

function cascade(grid, winningKeys, context) {
  const next = grid.map((row) => row.slice());
  for (let col = 0; col < config.columns; col += 1) {
    const remaining = [];
    for (let row = config.rows - 1; row >= 0; row -= 1) {
      if (!winningKeys.has(`${row}-${col}`)) remaining.push(next[row][col]);
    }
    for (let row = config.rows - 1; row >= 0; row -= 1) {
      next[row][col] = remaining.length ? remaining.shift() : createCell(context);
    }
  }
  return next;
}

function spin(stake, context = "base", freeMultiplierBank = 0) {
  let grid = createGrid(context);
  let totalWin = 0;
  let freeSpinsAwarded = 0;
  let cascades = 0;

  while (cascades < 10) {
    const payoutScale = context === "free" ? config.freeSpinPayoutScale : config.payoutScale;
    const result = evaluate(grid, payoutScale);
    const keys = new Set(result.wins.flatMap((win) => win.keys));
    const baseMultiplier = result.wins.reduce((sum, win) => sum + win.multiplier, 0);
    if (
      context === "free"
      && result.multiplierCount > 0
      && (!config.freeSpinMultiplier.requiresWinningCascade || result.wins.length > 0)
    ) {
      freeMultiplierBank += result.multiplierValues.reduce((sum, item) => sum + item.value, 0);
      freeMultiplierBank = Math.min(freeMultiplierBank, config.freeSpinMultiplier.maxBank);
    }
    const randomMultiplier = result.wins.length > 0 && result.multiplierCount > 0 && context !== "free"
      ? result.multiplierValues.reduce((sum, item) => sum + item.value, 0)
      : 0;
    const appliedMultiplier = context === "free" && result.wins.length > 0
      ? Math.max(1, freeMultiplierBank)
      : randomMultiplier > 0 ? randomMultiplier : 1;

    if (cascades === 0 && result.scatterCount >= 4) {
      freeSpinsAwarded = result.scatterCount >= 6 ? 15 : result.scatterCount === 5 ? 12 : 10;
    }

    if (!result.wins.length) break;
    totalWin += Math.round(stake * baseMultiplier * appliedMultiplier);
    grid = cascade(grid, keys, context);
    cascades += 1;
  }

  return {
    totalWin: Math.min(totalWin, stake * config.maxWinMultiplier),
    freeSpinsAwarded,
    cascades,
    freeMultiplierBank,
  };
}

function playFreeSpinSeries(stake, initialFreeSpins) {
  let paid = 0;
  let played = 0;
  let remaining = initialFreeSpins;
  let retriggers = 0;
  let freeMultiplierBank = 0;

  while (remaining > 0 && played < config.maxBonusSpinsPerRound) {
    remaining -= 1;
    played += 1;
    const result = spin(stake, "free", freeMultiplierBank);
    freeMultiplierBank = result.freeMultiplierBank;
    paid += result.totalWin;
    if (result.freeSpinsAwarded > 0) {
      retriggers += 1;
      remaining += result.freeSpinsAwarded;
    }
  }

  return { paid, played, retriggers, freeMultiplierBank };
}

function playPaidBaseRound(stake) {
  const base = spin(stake, "base");
  const bonus = base.freeSpinsAwarded > 0 ? playFreeSpinSeries(stake, base.freeSpinsAwarded) : {
    paid: 0,
    played: 0,
    retriggers: 0,
  };
  const cappedPaid = Math.min(base.totalWin + bonus.paid, stake * config.maxWinMultiplier);
  return {
    paid: cappedPaid,
    basePaid: base.totalWin,
    bonusPaid: Math.max(0, cappedPaid - base.totalWin),
    freeSpinsAwarded: base.freeSpinsAwarded,
    freeSpinsPlayed: bonus.played,
    retriggers: bonus.retriggers,
  };
}

function playBonusBuyRound(stake) {
  const bonus = playFreeSpinSeries(stake, config.bonusBuy.freeSpins);
  return {
    paid: Math.min(bonus.paid, stake * config.maxWinMultiplier),
    freeSpinsPlayed: bonus.played,
    retriggers: bonus.retriggers,
  };
}

function run(spins = 100000) {
  let bet = 0;
  let paid = 0;
  let basePaid = 0;
  let bonusPaid = 0;
  let hits = 0;
  let freeSpinTriggers = 0;
  let freeSpinsPlayed = 0;
  let retriggers = 0;
  let maxWin = 0;
  const wins = [];
  const buckets = new Map();

  for (let index = 0; index < spins; index += 1) {
    bet += config.stake;
    const result = playPaidBaseRound(config.stake);
    paid += result.paid;
    basePaid += result.basePaid;
    bonusPaid += result.bonusPaid;
    freeSpinsPlayed += result.freeSpinsPlayed;
    retriggers += result.retriggers;
    if (result.paid > 0) hits += 1;
    if (result.freeSpinsAwarded > 0) freeSpinTriggers += 1;
    if (result.paid > maxWin) maxWin = result.paid;
    wins.push(result.paid / config.stake);
    const bucket = result.paid === 0 ? "0x" : `${Math.floor(result.paid / config.stake)}x`;
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }

  wins.sort((a, b) => a - b);
  const percentile = (value) => wins[Math.min(wins.length - 1, Math.floor(wins.length * value))] || 0;
  return {
    spins,
    rtp: paid / bet,
    baseRtpContribution: basePaid / bet,
    bonusRtpContribution: bonusPaid / bet,
    hitRate: hits / spins,
    freeSpinRate: freeSpinTriggers / spins,
    freeSpinsPlayed,
    averageFreeSpinsPlayedPerTrigger: freeSpinTriggers > 0 ? freeSpinsPlayed / freeSpinTriggers : 0,
    retriggers,
    maxWinMultiplierObserved: maxWin / config.stake,
    p95WinMultiplier: percentile(0.95),
    p99WinMultiplier: percentile(0.99),
    p999WinMultiplier: percentile(0.999),
    paid,
    bet,
    topBuckets: [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
}

function runBonusBuy(buys = 100000) {
  let bet = 0;
  let paid = 0;
  let maxWin = 0;
  let freeSpinsPlayed = 0;
  let retriggers = 0;

  for (let index = 0; index < buys; index += 1) {
    bet += config.stake * config.bonusBuy.costMultiplier;
    const result = playBonusBuyRound(config.stake);
    paid += result.paid;
    freeSpinsPlayed += result.freeSpinsPlayed;
    retriggers += result.retriggers;
    if (result.paid > maxWin) maxWin = result.paid;
  }

  return {
    buys,
    costMultiplier: config.bonusBuy.costMultiplier,
    rtp: paid / bet,
    averageFreeSpinsPlayed: freeSpinsPlayed / buys,
    retriggers,
    maxWinMultiplierObserved: maxWin / config.stake,
    paid,
    bet,
  };
}

const spins = Number(process.argv[2] || 100000);
const mode = process.argv[3] || "base";
const seed = Number(process.argv[4] || 225);
random = createSeededRandom(seed);
console.log(JSON.stringify(mode === "bonus-buy" ? runBonusBuy(spins) : run(spins), null, 2));
