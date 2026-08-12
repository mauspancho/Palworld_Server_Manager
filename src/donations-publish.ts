#!/usr/bin/env node
import { botEnvSecrets } from "./bot-config.js";
import { loadEnv } from "./config.js";
import { connectDiscord, closeDiscord } from "./discord-client.js";
import { publishDonationsPanel } from "./donations-publisher.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { createContext } from "./paths.js";

const context = createContext();

async function main(): Promise<void> {
  const env = await loadEnv(context.rootDir);
  const memberRoleId = process.env.MEMBER_ROLE_ID;
  if (!memberRoleId) {
    throw new SafeError("MEMBER_ROLE_ID no esta configurado.");
  }
  const session = await connectDiscord(env);
  try {
    const result = await publishDonationsPanel(context.rootDir, session.guild, session.botMember, {
      MEMBER_ROLE_ID: memberRoleId,
      PENDING_MEMBER_ROLE_ID: process.env.PENDING_MEMBER_ROLE_ID || undefined
    });
    console.log([
      `Canal de donaciones ${result.createdChannel ? "creado" : "reutilizado"} (${result.channelId}).`,
      `Mensaje ${result.action === "created" ? "publicado" : "actualizado"} (${result.messageId}).`,
      `Overwrites actualizados: ${result.updatedOverwrites}.`
    ].join(" "));
  } finally {
    await closeDiscord(session);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError ? error.message : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
