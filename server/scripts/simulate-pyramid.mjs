import {
  getPyramidExpectedRtp,
  getPyramidMultipliers,
  getPyramidSlotProbabilities,
} from "../src/pyramid-engine.mjs";

const iterations = Number(process.env.ITERATIONS || 100000);
const stake = Number(process.env.STAKE || 100);
let seed = Number(process.env.SEED || 0x5eed1234) >>> 0;

if (!Number.isSafeInteger(iterations) || iterations < 1000) throw new Error("ITERATIONS must be an integer >= 1000");
if (!Number.isSafeInteger(stake) || stake < 5 || stake > 10000 || stake % 5 !== 0) {
  throw new Error("STAKE must be a multiple of 5 between 5 and 10000");
}

function random() {
  seed += 0x6d2b79f5;
  let value = seed;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

function pickSlot(probabilities) {
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  const target = random() * total;
  let cumulative = 0;
  for (let slot = 0; slot < probabilities.length; slot += 1) {
    cumulative += probabilities[slot];
    if (target < cumulative) return slot;
  }
  return probabilities.length - 1;
}

const results = [];
for (let rows = 8; rows <= 16; rows += 1) {
  for (const risk of ["low", "medium", "high"]) {
    const probabilities = getPyramidSlotProbabilities(rows);
    const multipliers = getPyramidMultipliers(rows, risk);
    let payout = 0;
    for (let index = 0; index < iterations; index += 1) {
      payout += Math.round(stake * multipliers[pickSlot(probabilities)]);
    }
    const simulatedRtp = payout / (stake * iterations);
    results.push({
      rows,
      risk,
      simulatedRtp: Number(simulatedRtp.toFixed(6)),
      exactRoundedRtp: Number(getPyramidExpectedRtp({ rows, risk, stake }).toFixed(6)),
    });
  }
}

console.table(results);
const simulatedValues = results.map((item) => item.simulatedRtp);
console.log(JSON.stringify({
  iterationsPerConfiguration: iterations,
  stake,
  configurations: results.length,
  simulatedMin: Math.min(...simulatedValues),
  simulatedMax: Math.max(...simulatedValues),
}, null, 2));
