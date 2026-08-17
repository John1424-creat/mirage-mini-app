import assert from "node:assert/strict";
import test from "node:test";
import { createRoundService } from "../src/round-service.mjs";

class MemoryRepository {
  constructor(balance = 1000) {
    this.balance = balance;
    this.rounds = new Map();
    this.commits = 0;
  }

  async findRoundByIdempotency(_playerId, idempotencyKey) {
    return this.rounds.get(idempotencyKey) || null;
  }

  async commitRound(input) {
    const existing = this.rounds.get(input.idempotencyKey);
    if (existing) return existing;
    if (this.balance < input.stake) {
      const error = new Error("Insufficient balance");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }
    this.commits += 1;
    this.balance = this.balance - input.stake + input.payout;
    const round = { id: `round-${this.commits}`, status: "settled", ...input };
    this.rounds.set(input.idempotencyKey, round);
    return round;
  }
}

function readyEngine(play = async () => ({ payout: 25, result: { multiplier: 2.5 } })) {
  return {
    isReady: true,
    readyRooms: ["pyramid"],
    supports: (room) => room === "pyramid",
    prepare({ configuration }) {
      return { rows: configuration.rows, risk: configuration.risk };
    },
    play,
  };
}

const pyramidInput = {
  playerId: "p1",
  room: "pyramid",
  walletType: "real",
  stake: 10,
  configuration: { rows: 13, risk: "medium" },
  idempotencyKey: "round-key-1",
};

test("does not touch funds while engine is disabled", async () => {
  const repository = new MemoryRepository();
  const service = createRoundService({ repository, engine: { isReady: false } });
  await assert.rejects(service.play(pyramidInput), (error) => error.code === "ROUND_ENGINE_NOT_READY");
  assert.equal(repository.commits, 0);
  assert.equal(repository.balance, 1000);
});

test("rejects rooms whose server engine is not ready before touching funds", async () => {
  const repository = new MemoryRepository();
  const service = createRoundService({ repository, engine: readyEngine() });
  await assert.rejects(
    service.play({ ...pyramidInput, room: "carpet" }),
    (error) => error.code === "ROOM_ENGINE_NOT_READY"
  );
  assert.equal(repository.commits, 0);
});

test("settles one round once for a repeated idempotency key", async () => {
  const repository = new MemoryRepository();
  let engineCalls = 0;
  const service = createRoundService({
    repository,
    engine: readyEngine(async () => {
      engineCalls += 1;
      return { payout: 25, result: { multiplier: 2.5 } };
    }),
  });
  const first = await service.play(pyramidInput);
  const repeated = await service.play(pyramidInput);
  assert.equal(first.id, repeated.id);
  assert.equal(engineCalls, 1);
  assert.equal(repository.commits, 1);
  assert.equal(repository.balance, 1015);
});

test("rejects an idempotency key reused with different parameters", async () => {
  const repository = new MemoryRepository();
  const service = createRoundService({ repository, engine: readyEngine() });
  await service.play(pyramidInput);
  await assert.rejects(
    service.play({ ...pyramidInput, stake: 15 }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT"
  );
  assert.equal(repository.commits, 1);
});

test("rejects a payout above max win without committing a round", async () => {
  const repository = new MemoryRepository();
  const service = createRoundService({
    repository,
    engine: readyEngine(async () => ({ payout: 100001, result: {} })),
  });
  await assert.rejects(service.play(pyramidInput), (error) => error.code === "INVALID_RUBY_AMOUNT");
  assert.equal(repository.commits, 0);
  assert.equal(repository.balance, 1000);
});
