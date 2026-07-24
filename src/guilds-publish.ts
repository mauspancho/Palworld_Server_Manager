#!/usr/bin/env node
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { connectDiscord, closeDiscord } from "./discord-client.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { createContext } from "./paths.js";
import { loadGuildsConfig } from "./guilds-config.js";
import { publishGuilds } from "./guilds-publisher.js";

const context = createContext();

async function main(): Promise<void> {
  const env = loadBotEnv(context.rootDir);
  const config = await loadGuildsConfig(context.rootDir);
  const session = await connectDiscord(env);
  try {
    const result = await publishGuilds(session.guild, session.botMember, config);
    console.log(`Gremios publicados. Roles creados: ${result.createdRoles.length}. Canales creados: ${result.createdChannels.length}. Canales actualizados: ${result.updatedChannels.length}.`);
  } finally {
    await closeDiscord(session);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError ? error.message : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
