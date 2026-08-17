import { HttpError } from "./errors.mjs";
import { secureRandomFloat } from "./secure-random.mjs";

export const PYRAMID_MATH_VERSION = "pyramid-v1";
export const PYRAMID_TARGET_RTP = 0.95;
export const PYRAMID_ROWS_MIN = 8;
export const PYRAMID_ROWS_MAX = 16;
export const PYRAMID_STAKE_MIN = 5;
export const PYRAMID_STAKE_MAX = 10000;
export const PYRAMID_STAKE_STEP = 5;

const RISK_PROFILES = Object.freeze({
  low: { base: 0.72, edge: 2.4, power: 1.7 },
  medium: { base: 0.22, edge: 12, power: 3 },
  high: { base: 0, edge: 130, power: 5.5 },
});

const SLOT_PROBABILITIES = Object.freeze({
  8: [0.138667, 0.060333, 0.093667, 0.129334, 0.156, 0.129334, 0.093667, 0.060333, 0.138667],
  9: [0.116334, 0.059, 0.096, 0.113667, 0.115, 0.115, 0.113667, 0.096, 0.059, 0.116334],
  10: [0.076333, 0.059333, 0.083666, 0.105, 0.116333, 0.118667, 0.116333, 0.105, 0.083666, 0.059333, 0.076333],
  11: [0.078333, 0.063334, 0.067667, 0.080667, 0.098, 0.112, 0.112, 0.098, 0.080667, 0.067667, 0.063334, 0.078333],
  12: [0.087667, 0.065333, 0.072334, 0.072, 0.080334, 0.081, 0.082667, 0.081, 0.080334, 0.072, 0.072334, 0.065333, 0.087667],
  13: [0.052, 0.063333, 0.063666, 0.071667, 0.083333, 0.081, 0.085, 0.085, 0.081, 0.083333, 0.071667, 0.063666, 0.063333, 0.052],
  14: [0.043667, 0.043667, 0.054667, 0.070667, 0.077667, 0.078, 0.088667, 0.086, 0.088667, 0.078, 0.077667, 0.070667, 0.054667, 0.043667, 0.043667],
  15: [0.033333, 0.035, 0.048, 0.061667, 0.076, 0.082667, 0.082667, 0.080667, 0.080667, 0.082667, 0.082667, 0.076, 0.061667, 0.048, 0.035, 0.033333],
  16: [0.039333, 0.039333, 0.043667, 0.055333, 0.058, 0.067667, 0.085666, 0.08, 0.062, 0.08, 0.085666, 0.067667, 0.058, 0.055333, 0.043667, 0.039333, 0.039333],
});

const multiplierCache = new Map();

function assertRandomValue(value) {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("RNG must return a finite number in [0, 1)");
  }
  return value;
}

export function validatePyramidConfiguration(configuration, stake) {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new HttpError(400, "PYRAMID_CONFIGURATION_REQUIRED", "Pyramid rows and risk are required");
  }
  const rows = Number(configuration.rows);
  const risk = configuration.risk;
  if (!Number.isInteger(rows) || rows < PYRAMID_ROWS_MIN || rows > PYRAMID_ROWS_MAX) {
    throw new HttpError(400, "PYRAMID_ROWS_INVALID", `rows must be between ${PYRAMID_ROWS_MIN} and ${PYRAMID_ROWS_MAX}`);
  }
  if (!Object.hasOwn(RISK_PROFILES, risk)) {
    throw new HttpError(400, "PYRAMID_RISK_INVALID", "risk must be low, medium or high");
  }
  if (!Number.isSafeInteger(stake) || stake < PYRAMID_STAKE_MIN || stake > PYRAMID_STAKE_MAX || stake % PYRAMID_STAKE_STEP !== 0) {
    throw new HttpError(
      400,
      "PYRAMID_STAKE_INVALID",
      `stake must be a multiple of ${PYRAMID_STAKE_STEP} between ${PYRAMID_STAKE_MIN} and ${PYRAMID_STAKE_MAX}`
    );
  }
  return Object.freeze({ rows, risk });
}

export function getPyramidSlotProbabilities(rows) {
  const probabilities = SLOT_PROBABILITIES[rows];
  if (!probabilities) throw new HttpError(400, "PYRAMID_ROWS_INVALID", "Unsupported Pyramid row count");
  return probabilities;
}

export function getPyramidMultipliers(rows, risk) {
  const key = `${rows}:${risk}`;
  if (multiplierCache.has(key)) return multiplierCache.get(key);
  const profile = RISK_PROFILES[risk];
  const probabilities = getPyramidSlotProbabilities(rows);
  if (!profile) throw new HttpError(400, "PYRAMID_RISK_INVALID", "Unsupported Pyramid risk");

  const center = rows / 2;
  const raw = Array.from({ length: rows + 1 }, (_, slot) => {
    const distance = Math.abs(slot - center) / center;
    return profile.base + profile.edge * distance ** profile.power;
  });
  const expected = raw.reduce((sum, value, slot) => sum + value * probabilities[slot], 0);
  const scaled = Object.freeze(raw.map((value) => value * (PYRAMID_TARGET_RTP / expected)));
  multiplierCache.set(key, scaled);
  return scaled;
}

export function getPyramidExpectedRtp({ rows, risk, stake }) {
  const probabilities = getPyramidSlotProbabilities(rows);
  const multipliers = getPyramidMultipliers(rows, risk);
  return probabilities.reduce((sum, probability, slot) => {
    return sum + probability * Math.round(stake * multipliers[slot]) / stake;
  }, 0);
}

function pickWeightedSlot(probabilities, random) {
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  const target = assertRandomValue(random()) * total;
  let cumulative = 0;
  for (let slot = 0; slot < probabilities.length; slot += 1) {
    cumulative += probabilities[slot];
    if (target < cumulative) return slot;
  }
  return probabilities.length - 1;
}

function buildVisualPath(rows, slot, random) {
  const path = Array.from({ length: rows }, (_, index) => index < slot ? 1 : 0);
  for (let index = path.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(assertRandomValue(random()) * (index + 1));
    [path[index], path[swapIndex]] = [path[swapIndex], path[index]];
  }
  return path;
}

export function createPyramidEngine({ random = secureRandomFloat } = {}) {
  return Object.freeze({
    isReady: true,
    readyRooms: Object.freeze(["pyramid"]),
    supports(room) {
      return room === "pyramid";
    },
    prepare({ room, stake, configuration }) {
      if (room !== "pyramid") {
        throw new HttpError(503, "ROOM_ENGINE_NOT_READY", `Server engine is not ready for ${room}`);
      }
      return validatePyramidConfiguration(configuration, stake);
    },
    async play({ room, stake, configuration }) {
      if (room !== "pyramid") {
        throw new HttpError(503, "ROOM_ENGINE_NOT_READY", `Server engine is not ready for ${room}`);
      }
      const { rows, risk } = validatePyramidConfiguration(configuration, stake);
      const probabilities = getPyramidSlotProbabilities(rows);
      const slot = pickWeightedSlot(probabilities, random);
      const multiplier = getPyramidMultipliers(rows, risk)[slot];
      const payout = Math.round(stake * multiplier);
      return {
        payout,
        result: {
          type: "pyramid_drop",
          rows,
          risk,
          slot,
          path: buildVisualPath(rows, slot, random),
          multiplier: Number(multiplier.toFixed(8)),
          targetRtp: PYRAMID_TARGET_RTP,
        },
      };
    },
  });
}
