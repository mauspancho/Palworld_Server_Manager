#!/usr/bin/env node
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { connectDiscord, closeDiscord } from "./discord-client.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { createContext } from "./paths.js";
import { loadSelfRolesConfig } from "./self-roles-config.js";
import { selfRolesConfigPath } from "./self-roles-state.js";
import { publishSelfRoles } from "./self-roles-publisher.js";

const context = createContext();

async function main(): Promise<void> {
  const env = loadBotEnv(context.rootDir);
  const config = await loadSelfRolesConfig(selfRolesConfigPath(context.rootDir));
  const session = await connectDiscord(env);
  try {
    const result = await publishSelfRoles(context.rootDir, session.guild, session.botMember, config, env.ROLES_CHANNEL_ID);
    const created = result.createdRoleNames.length > 0
      ? ` Roles creados: ${result.createdRoleNames.join(", ")}.`
      : " No se crearon roles nuevos.";
    console.log(`Mensaje de self-roles ${result.action === "created" ? "creado" : "actualizado"} (${result.messageId}).${created}`);
  } finally {
    await closeDiscord(session);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError
    ? error.message
    : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
