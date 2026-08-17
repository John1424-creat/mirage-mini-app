import { HttpError } from "./errors.mjs";
import { assertRubies } from "./money.mjs";
import { canonicalJson } from "./canonical-json.mjs";

const ALLOWED_ROOMS = new Set(["pyramid", "carpet", "pharaoh"]);
const ALLOWED_WALLETS = new Set(["real", "demo"]);

function sameRequest(round, { room, walletType, stake, configuration }) {
  return round.room === room
    && round.walletType === walletType
    && round.stake === stake
    && canonicalJson(round.configuration) === canonicalJson(configuration);
}

export function createRoundService({ repository, engine, mathVersion = "pyramid-v1" }) {
  if (!repository) throw new Error("repository is required");
  if (!engine) throw new Error("engine is required");

  return {
    readyRooms: engine.readyRooms || [],
    async play({ playerId, room, walletType = "real", stake, configuration: requestedConfiguration, idempotencyKey }) {
      if (!engine.isReady) {
        throw new HttpError(503, "ROUND_ENGINE_NOT_READY", "Server round engine is not connected yet");
      }
      if (!ALLOWED_ROOMS.has(room)) throw new HttpError(400, "ROOM_INVALID", "Unknown game room");
      if (typeof engine.supports === "function" && !engine.supports(room)) {
        throw new HttpError(503, "ROOM_ENGINE_NOT_READY", `Server round engine is not ready for ${room}`);
      }
      if (!ALLOWED_WALLETS.has(walletType)) throw new HttpError(400, "WALLET_TYPE_INVALID", "Unsupported wallet type");
      assertRubies(stake, "stake", { min: 1, max: 10000 });
      if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        throw new HttpError(400, "IDEMPOTENCY_KEY_INVALID", "Idempotency key must contain 8-128 characters");
      }

      const configuration = typeof engine.prepare === "function"
        ? engine.prepare({ room, stake, configuration: requestedConfiguration })
        : (requestedConfiguration || {});

      const existing = await repository.findRoundByIdempotency(playerId, idempotencyKey);
      if (existing) {
        if (!sameRequest(existing, { room, walletType, stake, configuration })) {
          throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with different round parameters");
        }
        return existing;
      }

      const outcome = await engine.play({
        playerId,
        room,
        walletType,
        stake,
        mathVersion,
        configuration,
      });
      assertRubies(outcome.payout, "payout", { max: stake * 10000 });
      return repository.commitRound({
        playerId,
        room,
        walletType,
        stake,
        mathVersion,
        idempotencyKey,
        configuration,
        payout: outcome.payout,
        result: outcome.result,
      });
    },
  };
}
