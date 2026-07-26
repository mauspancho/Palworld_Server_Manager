import { ChannelType, Guild, GuildMember, PermissionFlagsBits, TextChannel } from "discord.js";
import type { BotEnv } from "./bot-config.js";
import { SafeError } from "./errors.js";
import { loadBreedingCatalog } from "./breeding-service.js";
import { buildBreedingPanelPayload } from "./breeding-components.js";
import { readBreedingPanelState, writeBreedingPanelState } from "./breeding-state.js";
import { repairBreedingChannelPermissions, validateBreedingChannelPermissions } from "./breeding-permissions.js";

export interface PublishBreedingPanelResult {
  action: "created" | "updated";
  messageId: string;
  permissionUpdates: number;
  permissionErrors: string[];
}

export function decideBreedingPublishAction(stateExists: boolean, messageExists: boolean): "create" | "update" {
  return stateExists && messageExists ? "update" : "create";
}

export async function publishBreedingPanel(
  rootDir: string,
  guild: Guild,
  botMember: GuildMember,
  env: BotEnv
): Promise<PublishBreedingPanelResult> {
  const channel = await fetchBreedingChannel(guild, env);
  const permissionResult = await repairBreedingChannelPermissions(guild, botMember, channel, env);
  const validationErrors = validateBreedingChannelPermissions(botMember, channel);
  if (validationErrors.length > 0) {
    throw new SafeError(validationErrors.join("\n"));
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new SafeError("El bot necesita ManageChannels para publicar el panel de crianza.");
  }

  const catalog = await loadBreedingCatalog(rootDir);
  const payload = buildBreedingPanelPayload(catalog);
  const previousState = await readBreedingPanelState(rootDir);
  const previousMessage = previousState?.channelId === channel.id
    ? await channel.messages.fetch(previousState.messageId).catch(() => null)
    : null;

  if (previousMessage && previousMessage.author.id === botMember.id) {
    const message = await previousMessage.edit(payload);
    await writeBreedingPanelState(rootDir, createState(guild.id, channel.id, message.id));
    return {
      action: "updated",
      messageId: message.id,
      permissionUpdates: permissionResult.updatedOverwrites,
      permissionErrors: permissionResult.errors
    };
  }

  const message = await channel.send(payload);
  await writeBreedingPanelState(rootDir, createState(guild.id, channel.id, message.id));
  return {
    action: "created",
    messageId: message.id,
    permissionUpdates: permissionResult.updatedOverwrites,
    permissionErrors: permissionResult.errors
  };
}

export async function fetchBreedingChannel(guild: Guild, env: BotEnv): Promise<TextChannel> {
  if (!env.BREEDING_CHANNEL_ID) {
    throw new SafeError("BREEDING_CHANNEL_ID no esta configurado.");
  }
  const channel = await guild.channels.fetch(env.BREEDING_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new SafeError("BREEDING_CHANNEL_ID debe corresponder a un canal de texto existente.");
  }
  if (!channel.name.toLowerCase().includes("crianza")) {
    throw new SafeError(`BREEDING_CHANNEL_ID apunta a "${channel.name}", pero el canal visible debe ser crianza.`);
  }
  if (channel.guild.id !== env.DISCORD_GUILD_ID) {
    throw new SafeError("BREEDING_CHANNEL_ID no pertenece al servidor configurado.");
  }
  return channel;
}

function createState(guildId: string, channelId: string, messageId: string) {
  return {
    guildId,
    channelId,
    messageId,
    updatedAt: new Date().toISOString()
  };
}
