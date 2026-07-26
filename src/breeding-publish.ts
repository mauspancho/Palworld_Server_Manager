#!/usr/bin/env node
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { connectDiscord, closeDiscord } from "./discord-client.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { OperationLogger } from "./logger.js";
import { createContext } from "./paths.js";
import { publishBreedingPanel } from "./breeding-publisher.js";

const context = createContext();

async function main(): Promise<void> {
  const env = loadBotEnv(context.rootDir);
  const session = await connectDiscord(env);
  try {
    const logger = new OperationLogger(context.logsDir, botEnvSecrets(env));
    const result = await publishBreedingPanel(context.rootDir, session.guild, session.botMember, env);
    await logger.log("Panel de crianza publicado o reparado.", result);
    console.log(`Panel de crianza ${result.action === "created" ? "publicado" : "actualizado"} (${result.messageId}).`);
    console.log(`Permisos actualizados: ${result.permissionUpdates}.`);
    if (result.permissionErrors.length > 0) {
      console.log(`Errores de permisos: ${result.permissionErrors.join(" | ")}`);
      process.exitCode = 1;
    }
  } finally {
    await closeDiscord(session);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError ? error.message : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
