#!/usr/bin/env node
import { createBotClient, validateBotStartup } from "./bot-runtime.js";
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { createContext } from "./paths.js";

const context = createContext();

async function main(): Promise<void> {
  const env = loadBotEnv(context.rootDir);
  const client = createBotClient();
  try {
    await client.login(env.DISCORD_BOT_TOKEN);
    await validateBotStartup(client, env, context.rootDir);
    console.log("Configuracion del bot valida.");
  } finally {
    client.destroy();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError
    ? error.message
    : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
