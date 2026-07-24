#!/usr/bin/env node
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { connectDiscord, closeDiscord } from "./discord-client.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { createContext } from "./paths.js";
import { loadDesiredStructure } from "./config.js";
import { loadSelfRolesConfig } from "./self-roles-config.js";
import { selfRolesConfigPath } from "./self-roles-state.js";
import { loadGuildsConfig } from "./guilds-config.js";
import { loadStatusConfig } from "./status-config.js";
import { booleanEnv } from "./env-utils.js";
import { TcpRconProbe } from "./rcon-client.js";
import { validateBotConfiguration } from "./bot-validation.js";
import { validateExistingSelfRoles } from "./self-roles-validation.js";

const context = createContext();

async function main(): Promise<void> {
  await loadDesiredStructure(context.configPath);
  const selfRoles = await loadSelfRolesConfig(selfRolesConfigPath(context.rootDir));
  await loadGuildsConfig(context.rootDir);
  loadStatusConfig();
  const env = loadBotEnv(context.rootDir);
  const session = await connectDiscord(env);
  try {
    const botValidation = await validateBotConfiguration(session.guild, session.botMember, env);
    const selfRoleValidation = await validateExistingSelfRoles(session.guild, session.botMember, env, selfRoles);
    const errors = [...botValidation.errors, ...selfRoleValidation.errors];
    const warnings = [...botValidation.warnings, ...selfRoleValidation.warnings];
    for (const warning of warnings) {
      console.warn(`Advertencia: ${warning}`);
    }
    if (errors.length > 0) {
      throw new SafeError(errors.join("\n"));
    }
  } finally {
    await closeDiscord(session);
  }

  if (booleanEnv("PALWORLD_RCON_ENABLED", false)) {
    const client = new TcpRconProbe({
      enabled: true,
      host: process.env.PALWORLD_RCON_HOST ?? "127.0.0.1",
      port: process.env.PALWORLD_RCON_PORT ? Number(process.env.PALWORLD_RCON_PORT) : null,
      passwordConfigured: Boolean(process.env.PALWORLD_RCON_PASSWORD),
      password: process.env.PALWORLD_RCON_PASSWORD,
      timeoutMs: 3000,
      allowedCommands: ["Info", "ShowPlayers", "Save"]
    });
    await client.test();
  }

  console.log("Validacion completa finalizada.");
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError ? error.message : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
