import assert from "node:assert/strict";
import test from "node:test";
import { signTelegramInitData, validateTelegramInitData } from "../src/telegram-auth.mjs";

const botToken = "123456:test-token";
const nowSeconds = 1786422600;

function validInitData(overrides = {}) {
  const fields = {
    auth_date: String(nowSeconds),
    query_id: "AAE-test-query",
    user: JSON.stringify({ id: 123456789, first_name: "Friedrich", username: "friedrich" }),
    ...overrides,
  };
  const params = new URLSearchParams(fields);
  params.set("hash", signTelegramInitData(params, botToken));
  return params.toString();
}

test("validates signed Telegram initData", () => {
  const parsed = validateTelegramInitData(validInitData(), { botToken, nowSeconds, maxAgeSeconds: 300 });
  assert.equal(parsed.user.id, "123456789");
  assert.equal(parsed.user.firstName, "Friedrich");
});

test("rejects tampered Telegram initData", () => {
  const tampered = new URLSearchParams(validInitData());
  tampered.set("user", JSON.stringify({ id: 999, first_name: "Attacker" }));
  assert.throws(
    () => validateTelegramInitData(tampered.toString(), { botToken, nowSeconds, maxAgeSeconds: 300 }),
    (error) => error.code === "TELEGRAM_SIGNATURE_INVALID"
  );
});

test("rejects expired Telegram initData", () => {
  const expired = validInitData({ auth_date: String(nowSeconds - 301) });
  assert.throws(
    () => validateTelegramInitData(expired, { botToken, nowSeconds, maxAgeSeconds: 300 }),
    (error) => error.code === "TELEGRAM_INIT_DATA_EXPIRED"
  );
});
