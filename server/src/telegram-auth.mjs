import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.mjs";

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function equalHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function signTelegramInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = hmac("WebAppData", botToken);
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

export function validateTelegramInitData(initData, {
  botToken,
  maxAgeSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
} = {}) {
  if (typeof initData !== "string" || initData.length === 0 || initData.length > 16384) {
    throw new HttpError(401, "TELEGRAM_INIT_DATA_INVALID", "Telegram initData is missing or invalid");
  }
  if (!botToken) throw new HttpError(500, "TELEGRAM_BOT_TOKEN_MISSING", "Telegram bot token is not configured");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") || "";
  const calculatedHash = signTelegramInitData(params, botToken);
  if (!equalHex(receivedHash, calculatedHash)) {
    throw new HttpError(401, "TELEGRAM_SIGNATURE_INVALID", "Telegram initData signature is invalid");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isSafeInteger(authDate)) {
    throw new HttpError(401, "TELEGRAM_AUTH_DATE_INVALID", "Telegram auth_date is invalid");
  }
  const age = nowSeconds - authDate;
  if (age < -30 || age > maxAgeSeconds) {
    throw new HttpError(401, "TELEGRAM_INIT_DATA_EXPIRED", "Telegram initData has expired");
  }

  let user;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    throw new HttpError(401, "TELEGRAM_USER_INVALID", "Telegram user payload is invalid");
  }
  if (!user || !Number.isSafeInteger(Number(user.id)) || !String(user.first_name || "").trim()) {
    throw new HttpError(401, "TELEGRAM_USER_INVALID", "Telegram user payload is incomplete");
  }

  return {
    authDate,
    queryId: params.get("query_id") || null,
    startParam: params.get("start_param") || null,
    user: {
      id: String(user.id),
      username: user.username || null,
      firstName: String(user.first_name).trim(),
      lastName: user.last_name || null,
      languageCode: user.language_code || null,
      photoUrl: user.photo_url || null,
      isPremium: Boolean(user.is_premium),
    },
  };
}
