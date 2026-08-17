import { HttpError } from "./errors.mjs";

export function assertRubies(value, field = "amount", { min = 0, max = 1000000000 } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, "INVALID_RUBY_AMOUNT", `${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function calculateSettlement({ balance, reserved, stake, payout }) {
  assertRubies(balance, "balance");
  assertRubies(reserved, "reserved");
  assertRubies(stake, "stake", { min: 1 });
  assertRubies(payout, "payout");
  if (reserved < stake) throw new HttpError(409, "ROUND_NOT_RESERVED", "Round stake is not reserved");
  if (balance < stake) throw new HttpError(409, "INSUFFICIENT_BALANCE", "Balance is lower than the reserved stake");
  return {
    balanceAfterStake: balance - stake,
    balanceAfterSettlement: balance - stake + payout,
    reservedAfterSettlement: reserved - stake,
  };
}
