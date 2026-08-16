import dotenv from "dotenv";
import path from "node:path";
import { SafeError } from "./errors.js";
import { booleanEnv, numberEnv, optionalEnv } from "./env-utils.js";
import type { TikTokEnv, TikTokMention } from "./tiktok-types.js";

const allowedMentions: TikTokMention[] = ["ninguna", "everyone", "here"];

export interface LoadTikTokEnvOptions {
  requireConfigured?: boolean;
}

export function loadTikTokEnv(rootDir: string, options: LoadTikTokEnvOptions = {}): TikTokEnv {
  dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

  const enabled = booleanEnv("TIKTOK_ALERTS_ENABLED", false);
  const shouldValidate = enabled || options.requireConfigured === true;
  const rawMention = optionalEnv("TIKTOK_MENTION", "ninguna") as TikTokMention;
  const pollingIntervalSeconds = numberEnv("TIKTOK_POLLING_INTERVAL_SECONDS", 300);
  const callbackPort = numberEnv("TIKTOK_CALLBACK_PORT", 8788);
  const errors: string[] = [];

  if (!allowedMentions.includes(rawMention)) {
    errors.push("TIKTOK_MENTION debe ser ninguna, everyone o here.");
  }
  if (pollingIntervalSeconds < 60) {
    errors.push("TIKTOK_POLLING_INTERVAL_SECONDS debe ser al menos 60.");
  }
  if (!Number.isInteger(callbackPort) || callbackPort < 1 || callbackPort > 65535) {
    errors.push("TIKTOK_CALLBACK_PORT debe ser un puerto valido.");
  }

  const clientKey = optionalEnv("TIKTOK_CLIENT_KEY");
  const clientSecret = optionalEnv("TIKTOK_CLIENT_SECRET");
  const redirectUri = optionalEnv("TIKTOK_REDIRECT_URI");
  const callbackHost = optionalEnv("TIKTOK_CALLBACK_HOST", "127.0.0.1");
  const encryptionKeyRaw = optionalEnv("TIKTOK_TOKEN_ENCRYPTION_KEY");
  let tokenEncryptionKey: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  if (shouldValidate) {
    if (!clientKey) {
      errors.push("TIKTOK_CLIENT_KEY es requerido cuando TikTok esta habilitado.");
    }
    if (!clientSecret) {
      errors.push("TIKTOK_CLIENT_SECRET es requerido cuando TikTok esta habilitado.");
    }
    if (!redirectUri) {
      errors.push("TIKTOK_REDIRECT_URI es requerido cuando TikTok esta habilitado.");
    } else if (!redirectUri.startsWith("https://")) {
      errors.push("TIKTOK_REDIRECT_URI debe usar HTTPS.");
    }
    if (!callbackHost) {
      errors.push("TIKTOK_CALLBACK_HOST es requerido cuando TikTok esta habilitado.");
    }
    try {
      tokenEncryptionKey = parseTikTokEncryptionKey(encryptionKeyRaw);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) {
    throw new SafeError(errors.join("\n"));
  }

  return {
    enabled,
    clientKey,
    clientSecret,
    redirectUri,
    callbackHost,
    callbackPort,
    tokenEncryptionKey,
    pollingIntervalSeconds,
    mention: allowedMentions.includes(rawMention) ? rawMention : "ninguna"
  };
}

export function parseTikTokEncryptionKey(value: string): Buffer<ArrayBufferLike> {
  if (!value) {
    throw new SafeError("TIKTOK_TOKEN_ENCRYPTION_KEY es requerido cuando TikTok esta habilitado.");
  }
  const trimmed = value.trim();
  const isHex = /^[a-fA-F0-9]{64}$/.test(trimmed);
  const decoded = isHex ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (decoded.length !== 32) {
    throw new SafeError("TIKTOK_TOKEN_ENCRYPTION_KEY debe representar exactamente 32 bytes en base64 o hexadecimal.");
  }
  return decoded;
}

export function tiktokEnvSecrets(env?: Partial<TikTokEnv>): string[] {
  return [
    env?.clientSecret ?? process.env.TIKTOK_CLIENT_SECRET ?? "",
    process.env.TIKTOK_TOKEN_ENCRYPTION_KEY ?? ""
  ].filter(Boolean);
}
