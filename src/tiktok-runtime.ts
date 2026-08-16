import { Client, Guild } from "discord.js";
import type { BotEnv } from "./bot-config.js";
import { OperationLogger } from "./logger.js";
import { loadTikTokEnv } from "./tiktok-config.js";
import { startTikTokCallbackServer, type TikTokCallbackServer } from "./tiktok-callback-server.js";
import { validateTikTokDestination } from "./tiktok-publisher.js";
import { createTikTokServiceContext, runTikTokPollingOnce } from "./tiktok-service.js";
import { TikTokStore } from "./tiktok-store.js";
import type { TikTokEnv } from "./tiktok-types.js";
import { sanitizeTikTokError, tiktokLogSecrets } from "./tiktok-sanitize.js";
import path from "node:path";

export interface TikTokRuntime {
  tiktokEnv: TikTokEnv;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  runOnce: () => Promise<number>;
}

export async function validateTikTokStartup(client: Client, env: BotEnv, rootDir: string): Promise<string[]> {
  const tiktokEnv = loadTikTokEnv(rootDir);
  if (!tiktokEnv.enabled) {
    return [];
  }
  const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID);
  const botUserId = client.user?.id;
  if (!botUserId) {
    return ["No se pudo identificar el usuario del bot para TikTok."];
  }
  const botMember = await guild.members.fetch(botUserId);
  return validateTikTokDestination(guild, botMember, env);
}

export function createTikTokRuntime(client: Client, env: BotEnv, rootDir: string): TikTokRuntime {
  const tiktokEnv = loadTikTokEnv(rootDir);
  let callbackServer: TikTokCallbackServer | null = null;
  let timer: NodeJS.Timeout | null = null;
  let guildCache: Guild | null = null;
  let running = false;
  const store = new TikTokStore(rootDir);
  const logger = new OperationLogger(path.join(rootDir, "logs"), tiktokLogSecrets(env, tiktokEnv));

  const runOnce = async (): Promise<number> => {
    if (!tiktokEnv.enabled) {
      return 0;
    }
    const guild = guildCache ?? await client.guilds.fetch(env.DISCORD_GUILD_ID);
    guildCache = guild;
    try {
      const published = await runTikTokPollingOnce({ rootDir, env, tiktokEnv, store, logger }, guild);
      await store.update((state) => {
        state.pollingState.lastError = undefined;
        state.pollingState.lastErrorAt = undefined;
      });
      return published;
    } catch (error) {
      await store.update((state) => {
        state.pollingState.lastErrorAt = new Date().toISOString();
        state.pollingState.lastError = sanitizeTikTokError(error, env, tiktokEnv);
      });
      await logger.log("TikTok polling fallo.", { error: sanitizeTikTokError(error, env, tiktokEnv) }).catch(() => undefined);
      return 0;
    }
  };

  return {
    tiktokEnv,
    start: async () => {
      if (!tiktokEnv.enabled || running) {
        return;
      }
      running = true;
      callbackServer = await startTikTokCallbackServer({ client, env, tiktokEnv, rootDir });
      await store.update((state) => {
        state.pollingState.lastStartedAt = new Date().toISOString();
      });
      timer = setInterval(() => {
        void runOnce();
      }, tiktokEnv.pollingIntervalSeconds * 1000);
      void runOnce();
      await logger.log("TikTok runtime iniciado.", {
        callbackHost: tiktokEnv.callbackHost,
        callbackPort: tiktokEnv.callbackPort,
        pollingIntervalSeconds: tiktokEnv.pollingIntervalSeconds
      }).catch(() => undefined);
    },
    stop: async () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (callbackServer) {
        await callbackServer.close().catch((error) => logger.log("TikTok callback close fallo.", { error: sanitizeTikTokError(error, env, tiktokEnv) }));
        callbackServer = null;
      }
      if (running) {
        running = false;
        await store.update((state) => {
          state.pollingState.lastStoppedAt = new Date().toISOString();
        }).catch(() => undefined);
      }
    },
    runOnce
  };
}
