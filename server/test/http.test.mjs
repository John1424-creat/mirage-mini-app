import assert from "node:assert/strict";
import test from "node:test";
import { createHttpServer } from "../src/http.mjs";

async function withServer(callback) {
  const repository = {
    async findPlayerBySessionHash() { return { id: "player-1" }; },
    async getAccount() { return { id: "player-1", balances: { real: 1000, bonus: 0, demo: 10000 } }; },
    async listLedger() { return []; },
  };
  const unavailable = Object.assign(new Error("not ready"), {
    status: 503,
    code: "ROUND_ENGINE_NOT_READY",
  });
  const roundService = { readyRooms: ["pyramid"], async play() { throw unavailable; } };
  const config = {
    corsOrigin: "https://john1424-creat.github.io",
    telegramBotToken: "unused",
    telegramInitDataMaxAgeSeconds: 300,
    sessionTtlSeconds: 86400,
  };
  const server = createHttpServer({ config, repository, roundService });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("health endpoint is available without authentication", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", readyRooms: ["pyramid"] });
  });
});

test("account endpoint requires a bearer token", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/account`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "AUTH_REQUIRED");
  });
});
