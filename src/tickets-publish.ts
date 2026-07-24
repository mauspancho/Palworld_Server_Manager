#!/usr/bin/env node
import { ChannelType } from "discord.js";
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { connectDiscord, closeDiscord } from "./discord-client.js";
import { booleanEnv, optionalEnv } from "./env-utils.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { createContext } from "./paths.js";
import { buildTicketPanelPayload } from "./tickets-panel.js";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import path from "node:path";

const context = createContext();

async function main(): Promise<void> {
  if (!booleanEnv("TICKETS_ENABLED", true)) {
    console.log("Tickets desactivados.");
    return;
  }
  const panelChannelId = optionalEnv("TICKET_PANEL_CHANNEL_ID");
  if (!panelChannelId) {
    throw new SafeError("TICKET_PANEL_CHANNEL_ID no esta configurado.");
  }
  const env = loadBotEnv(context.rootDir);
  const session = await connectDiscord(env);
  try {
    const channel = await session.guild.channels.fetch(panelChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new SafeError("TICKET_PANEL_CHANNEL_ID debe ser un canal de texto.");
    }
    const statePath = path.join(context.rootDir, "state", "tickets-panel-message.json");
    const state = await readJsonFile<{ messageId?: string; channelId?: string }>(statePath, {});
    const existing = state.messageId && state.channelId === channel.id ? await channel.messages.fetch(state.messageId).catch(() => null) : null;
    const message = existing ? await existing.edit(buildTicketPanelPayload()) : await channel.send(buildTicketPanelPayload());
    await writeJsonAtomic(statePath, { guildId: session.guild.id, channelId: channel.id, messageId: message.id, updatedAt: new Date().toISOString() });
    console.log(`Panel de tickets ${existing ? "actualizado" : "publicado"}.`);
  } finally {
    await closeDiscord(session);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError ? error.message : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
