import { randomBytes } from "node:crypto";

const TWO_POW_53 = 9007199254740992;

export function secureRandomFloat() {
  const value = randomBytes(8).readBigUInt64BE() >> 11n;
  return Number(value) / TWO_POW_53;
}
