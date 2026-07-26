#!/usr/bin/env node
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { loadDesiredStructure } from "./config.js";
import { connectDiscord, closeDiscord } from "./discord-client.js";
import { SafeError, sanitizeSecret } from "./errors.js";
import { formatInformationRepairResult, repairInformationPermissions } from "./info-permissions.js";
import { OperationLogger } from "./logger.js";
import { createContext } from "./paths.js";

const context = createContext();

async function main(): Promise<void> {
  const env = loadBotEnv(context.rootDir);
  const desired = await loadDesiredStructure(context.configPath);
  const session = await connectDiscord(env);
  try {
    const logger = new OperationLogger(context.logsDir, botEnvSecrets(env));
    const result = await repairInformationPermissions(session.guild, session.botMember, env, desired, {
      rootDir: context.rootDir,
      reason: "info:repair",
      log: (message, details) => logger.log(message, details)
    });
    console.log(formatInformationRepairResult(result));
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await closeDiscord(session);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
