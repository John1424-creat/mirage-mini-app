import { HttpError } from "./errors.mjs";
import { assertRubies } from "./money.mjs";

const ALLOWED_ROOMS = new Set(["pyramid", "carpet", "pharaoh"]);
const ALLOWED_WALLETS = new Set(["real", "demo"]);

export function createRoundService({ repository, engine, mathVersion = "telegram260" }) {
  if (!repository) throw new Error("repository is required");
  if (!engine) throw new Error("engine is required");

  return {
    async play({ playerId, room, walletType = "real", stake, idempotencyKey }) {
      if (!engine.isReady) {
        throw new HttpError(503, "ROUND_ENGINE_NOT_READY", "Server round engine is not connected yet");
      }
      if (!ALLOWED_ROOMS.has(room)) throw new HttpError(400, "ROOM_INVALID", "Unknown game room");
      if (!ALLOWED_WALLETS.has(walletType)) throw new HttpError(400, "WALLET_TYPE_INVALID", "Unsupported wallet type");
      assertRubies(stake, "stake", { min: 1, max: 10000 });
      if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        throw new HttpError(400, "IDEMPOTENCY_KEY_INVALID", "Idempotency key must contain 8-128 characters");
      }

      const claim = await repository.claimRound({
        playerId,
        room,
        walletType,
        stake,
        mathVersion,
        idempotencyKey,
      });
      if (!claim.created) return claim.round;

      try {
        const outcome = await engine.play({
          roundId: claim.round.id,
          playerId,
          room,
          walletType,
          stake,
          mathVersion,
        });
        assertRubies(outcome.payout, "payout", { max: stake * 10000 });
        return await repository.settleRound({
          roundId: claim.round.id,
          payout: outcome.payout,
          result: outcome.result,
        });
      } catch (error) {
        await repository.failRound({ roundId: claim.round.id, failureCode: error.code || "ENGINE_FAILURE" });
        throw error;
      }
    },
  };
}
