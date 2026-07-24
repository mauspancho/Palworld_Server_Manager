#!/usr/bin/env node
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { connectDiscord, closeDiscord } from "./discord-client.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { loadStatusConfig } from "./status-config.js";

async function main(): Promise<void> {
  const env = loadBotEnv(process.cwd());
  const config = loadStatusConfig();
  if (!config.enabled) {
    console.log("Panel de estado desactivado.");
    return;
  }
  const session = await connectDiscord(env);
  try {
    if (!config.statusChannelId) {
      throw new SafeError("PALWORLD_STATUS_CHANNEL_ID no esta configurado.");
    }
    const channel = await session.guild.channels.fetch(config.statusChannelId);
    if (!channel) {
      throw new SafeError("PALWORLD_STATUS_CHANNEL_ID no existe.");
    }
    console.log("Configuracion de estado valida.");
  } finally {
    await closeDiscord(session);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError ? error.message : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
