import assert from "node:assert/strict";
import test from "node:test";
import {
  createPyramidEngine,
  getPyramidExpectedRtp,
  getPyramidMultipliers,
  getPyramidSlotProbabilities,
  validatePyramidConfiguration,
} from "../src/pyramid-engine.mjs";

function sequenceRandom(values, fallback = 0.5) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

test("validates Pyramid rows, risk and stake step", () => {
  assert.deepEqual(validatePyramidConfiguration({ rows: 13, risk: "medium" }, 10), { rows: 13, risk: "medium" });
  assert.throws(() => validatePyramidConfiguration({ rows: 7, risk: "medium" }, 10), (error) => error.code === "PYRAMID_ROWS_INVALID");
  assert.throws(() => validatePyramidConfiguration({ rows: 13, risk: "extreme" }, 10), (error) => error.code === "PYRAMID_RISK_INVALID");
  assert.throws(() => validatePyramidConfiguration({ rows: 13, risk: "medium" }, 7), (error) => error.code === "PYRAMID_STAKE_INVALID");
});

test("keeps calibrated probability tables normalized and symmetric", () => {
  for (let rows = 8; rows <= 16; rows += 1) {
    const probabilities = getPyramidSlotProbabilities(rows);
    const total = probabilities.reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - 1) < 0.00001, `${rows} rows total ${total}`);
    for (let slot = 0; slot <= rows; slot += 1) {
      assert.ok(Math.abs(probabilities[slot] - probabilities[rows - slot]) < 0.003, `${rows}:${slot}`);
    }
  }
});

test("selects a server-authoritative slot and returns a path ending in it", async () => {
  const engine = createPyramidEngine({ random: sequenceRandom([0.51, 0.2, 0.8, 0.3, 0.7]) });
  const outcome = await engine.play({
    room: "pyramid",
    stake: 10,
    configuration: { rows: 8, risk: "medium" },
  });
  assert.equal(outcome.result.type, "pyramid_drop");
  assert.equal(outcome.result.path.length, 8);
  assert.equal(outcome.result.path.reduce((sum, value) => sum + value, 0), outcome.result.slot);
  assert.equal(outcome.payout, Math.round(10 * outcome.result.multiplier));
});

test("keeps the continuous multiplier model at 95% before integer payout rounding", () => {
  for (let rows = 8; rows <= 16; rows += 1) {
    for (const risk of ["low", "medium", "high"]) {
      const probabilities = getPyramidSlotProbabilities(rows);
      const multipliers = getPyramidMultipliers(rows, risk);
      const expected = probabilities.reduce((sum, probability, slot) => sum + probability * multipliers[slot], 0);
      assert.ok(Math.abs(expected - 0.95) < 1e-12, `${rows}:${risk} expected ${expected}`);
    }
  }
});

test("keeps integer-payout RTP close to target for normal and large stakes", () => {
  for (const stake of [100, 1000, 10000]) {
    for (let rows = 8; rows <= 16; rows += 1) {
      for (const risk of ["low", "medium", "high"]) {
        const rtp = getPyramidExpectedRtp({ rows, risk, stake });
        const tolerance = stake === 100 ? 0.003 : 0.0005;
        assert.ok(Math.abs(rtp - 0.95) <= tolerance, `${stake}:${rows}:${risk} RTP ${rtp}`);
      }
    }
  }
});
