#!/usr/bin/env node
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { connectDiscord, closeDiscord } from "./discord-client.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { createContext } from "./paths.js";
import { loadStatusConfig } from "./status-config.js";
import { publishStatusPanel } from "./status-publisher.js";

const context = createContext();

async function main(): Promise<void> {
  const env = loadBotEnv(context.rootDir);
  const session = await connectDiscord(env);
  try {
    await publishStatusPanel(context.rootDir, session.guild, loadStatusConfig());
    console.log("Panel de estado publicado o actualizado.");
  } finally {
    await closeDiscord(session);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError ? error.message : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
