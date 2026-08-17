import { createServer } from "node:http";
import { HttpError, asHttpError } from "./errors.mjs";
import { hashSessionToken, createSessionToken } from "./session-token.mjs";
import { validateTelegramInitData } from "./telegram-auth.mjs";

function sendJson(response, status, payload, origin) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type, idempotency-key",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    vary: "origin",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1048576) throw new HttpError(413, "BODY_TOO_LARGE", "Request body is too large");
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "JSON_INVALID", "Request body must be valid JSON");
  }
}

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || "");
  if (!match) throw new HttpError(401, "AUTH_REQUIRED", "Bearer token is required");
  return match[1];
}

export function createHttpServer({ config, repository, roundService }) {
  return createServer(async (request, response) => {
    const requestOrigin = request.headers.origin;
    const origin = requestOrigin === config.corsOrigin ? requestOrigin : config.corsOrigin;
    if (request.method === "OPTIONS") return sendJson(response, 204, {}, origin);

    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, { status: "ok", readyRooms: roundService.readyRooms }, origin);
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/telegram") {
        const body = await readJson(request);
        const telegram = validateTelegramInitData(body.initData, {
          botToken: config.telegramBotToken,
          maxAgeSeconds: config.telegramInitDataMaxAgeSeconds,
        });
        const player = await repository.upsertTelegramPlayer(telegram.user);
        const token = createSessionToken();
        const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
        await repository.createAuthSession({ playerId: player.id, tokenHash: hashSessionToken(token), expiresAt });
        const account = await repository.getAccount(player.id);
        return sendJson(response, 200, { token, expiresAt: expiresAt.toISOString(), account }, origin);
      }

      const token = bearerToken(request);
      const player = await repository.findPlayerBySessionHash(hashSessionToken(token));
      if (!player) throw new HttpError(401, "SESSION_INVALID", "Session is invalid or expired");

      if (request.method === "GET" && url.pathname === "/v1/account") {
        return sendJson(response, 200, await repository.getAccount(player.id), origin);
      }

      if (request.method === "GET" && url.pathname === "/v1/ledger") {
        const requestedLimit = Number(url.searchParams.get("limit") || 50);
        const limit = Number.isSafeInteger(requestedLimit)
          ? Math.max(1, Math.min(100, requestedLimit))
          : 50;
        return sendJson(response, 200, { items: await repository.listLedger(player.id, limit) }, origin);
      }

      if (request.method === "POST" && url.pathname === "/v1/games/rounds") {
        const body = await readJson(request);
        const idempotencyKey = request.headers["idempotency-key"] || body.idempotencyKey;
        const round = await roundService.play({
          playerId: player.id,
          room: body.room,
          walletType: body.walletType || "real",
          stake: body.stake,
          configuration: body.configuration,
          idempotencyKey,
        });
        return sendJson(response, 200, round, origin);
      }

      const roundMatch = /^\/v1\/games\/rounds\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(url.pathname);
      if (request.method === "GET" && roundMatch) {
        const round = await repository.getRound(player.id, roundMatch[1]);
        if (!round) throw new HttpError(404, "ROUND_NOT_FOUND", "Round not found");
        return sendJson(response, 200, round, origin);
      }

      throw new HttpError(404, "ROUTE_NOT_FOUND", "Route not found");
    } catch (error) {
      const safe = asHttpError(error);
      if (safe.status >= 500) console.error(error);
      return sendJson(response, safe.status, {
        error: { code: safe.code, message: safe.message, details: safe.details },
      }, origin);
    }
  });
}
