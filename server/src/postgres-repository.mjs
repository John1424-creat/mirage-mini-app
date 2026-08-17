import { HttpError } from "./errors.mjs";
import { calculateSettlement } from "./money.mjs";

const WALLET_COLUMNS = {
  real: { balance: "real_balance", reserved: "reserved_real_balance" },
  bonus: { balance: "bonus_balance", reserved: "reserved_bonus_balance" },
  demo: { balance: "demo_balance", reserved: "reserved_demo_balance" },
};

function numeric(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new HttpError(500, "DATABASE_AMOUNT_INVALID", "Database returned an unsafe amount");
  return parsed;
}

function publicRound(row) {
  return {
    id: row.id,
    room: row.room,
    walletType: row.wallet_type,
    status: row.status,
    stake: numeric(row.stake),
    payout: numeric(row.payout),
    mathVersion: row.math_version,
    result: row.result,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  };
}

export class PostgresRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertTelegramPlayer(user) {
    return this.transaction(async (client) => {
      const playerResult = await client.query({
        text: `
          INSERT INTO players (
            telegram_user_id, username, first_name, last_name, language_code, photo_url, is_premium
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (telegram_user_id) DO UPDATE SET
            username = EXCLUDED.username,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            language_code = EXCLUDED.language_code,
            photo_url = EXCLUDED.photo_url,
            is_premium = EXCLUDED.is_premium,
            updated_at = now()
          RETURNING *
        `,
        values: [user.id, user.username, user.firstName, user.lastName, user.languageCode, user.photoUrl, user.isPremium],
      });
      const player = playerResult.rows[0];
      await client.query("INSERT INTO wallets (player_id) VALUES ($1) ON CONFLICT (player_id) DO NOTHING", [player.id]);
      return player;
    });
  }

  async createAuthSession({ playerId, tokenHash, expiresAt }) {
    await this.pool.query(
      "INSERT INTO auth_sessions (player_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [playerId, tokenHash, expiresAt]
    );
  }

  async findPlayerBySessionHash(tokenHash) {
    const result = await this.pool.query({
      text: `
        SELECT p.*
        FROM auth_sessions s
        JOIN players p ON p.id = s.player_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
      `,
      values: [tokenHash],
    });
    return result.rows[0] || null;
  }

  async getAccount(playerId) {
    const result = await this.pool.query({
      text: `
        SELECT p.id, p.telegram_user_id, p.username, p.first_name, p.last_name, p.photo_url,
               w.real_balance, w.bonus_balance, w.demo_balance,
               w.reserved_real_balance, w.reserved_bonus_balance, w.reserved_demo_balance
        FROM players p
        JOIN wallets w ON w.player_id = p.id
        WHERE p.id = $1
      `,
      values: [playerId],
    });
    const row = result.rows[0];
    if (!row) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Account not found");
    return {
      id: row.id,
      telegramUserId: String(row.telegram_user_id),
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      photoUrl: row.photo_url,
      balances: {
        real: numeric(row.real_balance),
        bonus: numeric(row.bonus_balance),
        demo: numeric(row.demo_balance),
      },
      reserved: {
        real: numeric(row.reserved_real_balance),
        bonus: numeric(row.reserved_bonus_balance),
        demo: numeric(row.reserved_demo_balance),
      },
    };
  }

  async listLedger(playerId, limit = 50) {
    const result = await this.pool.query({
      text: `
        SELECT id, round_id, wallet_type, direction, reason, amount, balance_after, metadata, created_at
        FROM ledger_entries
        WHERE player_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      values: [playerId, limit],
    });
    return result.rows.map((row) => ({
      id: row.id,
      roundId: row.round_id,
      walletType: row.wallet_type,
      direction: row.direction,
      reason: row.reason,
      amount: numeric(row.amount),
      balanceAfter: numeric(row.balance_after),
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  async claimRound({ playerId, room, walletType, stake, mathVersion, idempotencyKey }) {
    const columns = WALLET_COLUMNS[walletType];
    if (!columns) throw new HttpError(400, "WALLET_TYPE_INVALID", "Unsupported wallet type");
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${playerId}:${idempotencyKey}`]);
      const existing = await client.query(
        "SELECT * FROM game_rounds WHERE player_id = $1 AND idempotency_key = $2",
        [playerId, idempotencyKey]
      );
      if (existing.rows[0]) return { created: false, round: publicRound(existing.rows[0]) };

      const walletResult = await client.query("SELECT * FROM wallets WHERE player_id = $1 FOR UPDATE", [playerId]);
      const wallet = walletResult.rows[0];
      if (!wallet) throw new HttpError(404, "WALLET_NOT_FOUND", "Wallet not found");
      const balance = numeric(wallet[columns.balance]);
      const reserved = numeric(wallet[columns.reserved]);
      if (balance - reserved < stake) throw new HttpError(409, "INSUFFICIENT_BALANCE", "Insufficient available balance");

      await client.query(
        `UPDATE wallets SET ${columns.reserved} = ${columns.reserved} + $2, updated_at = now() WHERE player_id = $1`,
        [playerId, stake]
      );
      const created = await client.query({
        text: `
          INSERT INTO game_rounds (player_id, room, wallet_type, status, stake, math_version, idempotency_key)
          VALUES ($1, $2, $3, 'requested', $4, $5, $6)
          RETURNING *
        `,
        values: [playerId, room, walletType, stake, mathVersion, idempotencyKey],
      });
      return { created: true, round: publicRound(created.rows[0]) };
    });
  }

  async settleRound({ roundId, payout, result }) {
    return this.transaction(async (client) => {
      const roundResult = await client.query("SELECT * FROM game_rounds WHERE id = $1 FOR UPDATE", [roundId]);
      const round = roundResult.rows[0];
      if (!round) throw new HttpError(404, "ROUND_NOT_FOUND", "Round not found");
      if (round.status === "settled") return publicRound(round);
      if (round.status !== "requested") throw new HttpError(409, "ROUND_NOT_SETTLEABLE", "Round cannot be settled");

      const columns = WALLET_COLUMNS[round.wallet_type];
      const walletResult = await client.query("SELECT * FROM wallets WHERE player_id = $1 FOR UPDATE", [round.player_id]);
      const wallet = walletResult.rows[0];
      const stake = numeric(round.stake);
      const settlement = calculateSettlement({
        balance: numeric(wallet[columns.balance]),
        reserved: numeric(wallet[columns.reserved]),
        stake,
        payout,
      });

      await client.query(
        `UPDATE wallets
         SET ${columns.balance} = $2, ${columns.reserved} = $3, updated_at = now()
         WHERE player_id = $1`,
        [round.player_id, settlement.balanceAfterSettlement, settlement.reservedAfterSettlement]
      );
      await client.query({
        text: `
          INSERT INTO ledger_entries (
            player_id, round_id, wallet_type, direction, reason, amount, balance_after, idempotency_key
          ) VALUES ($1, $2, $3, 'debit', 'game_stake', $4, $5, $6)
        `,
        values: [round.player_id, round.id, round.wallet_type, stake, settlement.balanceAfterStake, `${round.idempotency_key}:stake`],
      });
      if (payout > 0) {
        await client.query({
          text: `
            INSERT INTO ledger_entries (
              player_id, round_id, wallet_type, direction, reason, amount, balance_after, idempotency_key
            ) VALUES ($1, $2, $3, 'credit', 'game_payout', $4, $5, $6)
          `,
          values: [round.player_id, round.id, round.wallet_type, payout, settlement.balanceAfterSettlement, `${round.idempotency_key}:payout`],
        });
      }
      const settled = await client.query({
        text: `
          UPDATE game_rounds
          SET status = 'settled', payout = $2, result = $3, settled_at = now()
          WHERE id = $1
          RETURNING *
        `,
        values: [roundId, payout, result || {}],
      });
      return publicRound(settled.rows[0]);
    });
  }

  async failRound({ roundId, failureCode }) {
    return this.transaction(async (client) => {
      const roundResult = await client.query("SELECT * FROM game_rounds WHERE id = $1 FOR UPDATE", [roundId]);
      const round = roundResult.rows[0];
      if (!round || round.status !== "requested") return;
      const columns = WALLET_COLUMNS[round.wallet_type];
      await client.query(
        `UPDATE wallets SET ${columns.reserved} = ${columns.reserved} - $2, updated_at = now() WHERE player_id = $1`,
        [round.player_id, round.stake]
      );
      await client.query(
        "UPDATE game_rounds SET status = 'failed', failure_code = $2, settled_at = now() WHERE id = $1",
        [roundId, failureCode]
      );
    });
  }

  async getRound(playerId, roundId) {
    const result = await this.pool.query(
      "SELECT * FROM game_rounds WHERE id = $1 AND player_id = $2",
      [roundId, playerId]
    );
    return result.rows[0] ? publicRound(result.rows[0]) : null;
  }
}
