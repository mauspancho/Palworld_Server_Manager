import type { BotEnv } from "./bot-config.js";
import { botEnvSecrets } from "./bot-config.js";
import { sanitizeSecret } from "./errors.js";
import { tiktokEnvSecrets } from "./tiktok-config.js";
import type { TikTokEnv } from "./tiktok-types.js";

export function tiktokLogSecrets(env?: Partial<BotEnv>, tiktokEnv?: Partial<TikTokEnv>): string[] {
  return [...botEnvSecrets(env), ...tiktokEnvSecrets(tiktokEnv)];
}

export function sanitizeTikTokError(error: unknown, env?: Partial<BotEnv>, tiktokEnv?: Partial<TikTokEnv>): string {
  return sanitizeTikTokText(error instanceof Error ? error.stack ?? error.message : String(error), env, tiktokEnv);
}

export function sanitizeTikTokText(input: unknown, env?: Partial<BotEnv>, tiktokEnv?: Partial<TikTokEnv>): string {
  return sanitizeSecret(input, tiktokLogSecrets(env, tiktokEnv))
    .replace(/access_token["'=:\s]+[^"',\s&]+/gi, "access_token=[REDACTED]")
    .replace(/refresh_token["'=:\s]+[^"',\s&]+/gi, "refresh_token=[REDACTED]")
    .replace(/client_secret["'=:\s]+[^"',\s&]+/gi, "client_secret=[REDACTED]")
    .replace(/authorization code["'=:\s]+[^"',\s&]+/gi, "authorization code=[REDACTED]")
    .replace(/code["'=:\s]+[^"',\s&]+/gi, "code=[REDACTED]")
    .replace(/state["'=:\s]+[^"',\s&]+/gi, "state=[REDACTED]");
}
