import dotenv from "dotenv";
import path from "node:path";
import { SafeError } from "./errors.js";

export interface BotEnv {
  DISCORD_BOT_TOKEN: string;
  DISCORD_GUILD_ID: string;
  WELCOME_CHANNEL_ID: string;
  RULES_CHANNEL_ID: string;
  ROLES_CHANNEL_ID: string;
  GENERAL_CHAT_CHANNEL_ID: string;
  MEMBER_ROLE_ID: string;
  PENDING_MEMBER_ROLE_ID?: string;
  MEMBER_LOG_CHANNEL_ID: string;
  BREEDING_CHANNEL_ID?: string;
  GUILD_REQUEST_CHANNEL_ID?: string;
  DONATIONS_CHANNEL_ID?: string;
}

const requiredKeys = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
  "WELCOME_CHANNEL_ID",
  "RULES_CHANNEL_ID",
  "ROLES_CHANNEL_ID",
  "GENERAL_CHAT_CHANNEL_ID",
  "MEMBER_ROLE_ID",
  "MEMBER_LOG_CHANNEL_ID"
] as const;

export function loadBotEnv(rootDir: string): BotEnv {
  dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new SafeError(`Faltan variables requeridas en .env: ${missing.join(", ")}.`);
  }

  return {
    ...Object.fromEntries(requiredKeys.map((key) => [key, process.env[key]])),
    PENDING_MEMBER_ROLE_ID: process.env.PENDING_MEMBER_ROLE_ID || undefined,
    BREEDING_CHANNEL_ID: process.env.BREEDING_CHANNEL_ID || undefined,
    GUILD_REQUEST_CHANNEL_ID: process.env.GUILD_REQUEST_CHANNEL_ID || undefined,
    DONATIONS_CHANNEL_ID: process.env.DONATIONS_CHANNEL_ID || undefined
  } as unknown as BotEnv;
}

export function botEnvSecrets(env?: Partial<BotEnv>): string[] {
  return [
    env?.DISCORD_BOT_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "",
    process.env.PALWORLD_RCON_PASSWORD ?? ""
  ].filter(Boolean);
}
