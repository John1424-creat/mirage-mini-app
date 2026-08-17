import assert from "node:assert/strict";
import test from "node:test";
import { createRoundService } from "../src/round-service.mjs";

class MemoryRepository {
  constructor(balance = 1000) {
    this.balance = balance;
    this.rounds = new Map();
    this.claims = 0;
  }

  async claimRound(input) {
    if (this.rounds.has(input.idempotencyKey)) return { created: false, round: this.rounds.get(input.idempotencyKey) };
    if (this.balance < input.stake) {
      const error = new Error("Insufficient balance");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }
    this.claims += 1;
    const round = { id: `round-${this.claims}`, status: "requested", ...input };
    this.rounds.set(input.idempotencyKey, round);
    return { created: true, round };
  }

  async settleRound({ roundId, payout, result }) {
    const round = [...this.rounds.values()].find((item) => item.id === roundId);
    this.balance = this.balance - round.stake + payout;
    Object.assign(round, { status: "settled", payout, result });
    return round;
  }

  async failRound() {}
}

test("does not call or reserve funds while engine is disabled", async () => {
  const repository = new MemoryRepository();
  const service = createRoundService({ repository, engine: { isReady: false } });
  await assert.rejects(
    service.play({ playerId: "p1", room: "pharaoh", stake: 10, idempotencyKey: "round-key-1" }),
    (error) => error.code === "ROUND_ENGINE_NOT_READY"
  );
  assert.equal(repository.claims, 0);
  assert.equal(repository.balance, 1000);
});

test("settles one round once for repeated idempotency key", async () => {
  const repository = new MemoryRepository();
  let engineCalls = 0;
  const engine = {
    isReady: true,
    async play() {
      engineCalls += 1;
      return { payout: 25, result: { multiplier: 2.5 } };
    },
  };
  const service = createRoundService({ repository, engine });
  const input = { playerId: "p1", room: "pharaoh", stake: 10, idempotencyKey: "round-key-2" };
  const first = await service.play(input);
  const repeated = await service.play(input);
  assert.equal(first.id, repeated.id);
  assert.equal(engineCalls, 1);
  assert.equal(repository.claims, 1);
  assert.equal(repository.balance, 1015);
});

test("rejects a payout above max win", async () => {
  const repository = new MemoryRepository();
  const service = createRoundService({
    repository,
    engine: { isReady: true, async play() { return { payout: 100001, result: {} }; } },
  });
  await assert.rejects(
    service.play({ playerId: "p1", room: "pharaoh", stake: 10, idempotencyKey: "round-key-3" }),
    (error) => error.code === "INVALID_RUBY_AMOUNT"
  );
  assert.equal(repository.balance, 1000);
});
