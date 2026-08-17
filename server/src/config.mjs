import { HttpError } from "./errors.mjs";

function readInteger(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(500, "INVALID_CONFIG", `${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function readRequired(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(500, "MISSING_CONFIG", `${name} is required`);
  return value;
}

export function loadConfig() {
  return {
    port: readInteger("PORT", 8787, { min: 1, max: 65535 }),
    databaseUrl: readRequired("DATABASE_URL"),
    telegramBotToken: readRequired("TELEGRAM_BOT_TOKEN"),
    telegramInitDataMaxAgeSeconds: readInteger("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", 300, { min: 30, max: 3600 }),
    sessionTtlSeconds: readInteger("SESSION_TTL_SECONDS", 86400, { min: 300, max: 2592000 }),
    corsOrigin: process.env.CORS_ORIGIN?.trim() || "https://john1424-creat.github.io",
    nodeEnv: process.env.NODE_ENV?.trim() || "development",
    mathVersion: process.env.MATH_VERSION?.trim() || "telegram260",
  };
}
