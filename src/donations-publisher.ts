import {
  ChannelType,
  Guild,
  GuildMember,
  Message,
  PermissionFlagsBits,
  PermissionOverwriteOptions,
  TextChannel
} from "discord.js";
import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import { loadDesiredStructure } from "./config.js";
import type { DesiredStructure } from "./domain.js";
import { SafeError } from "./errors.js";
import {
  isInformationCategoryName,
  permissionOverwriteDiff
} from "./info-permissions.js";
import {
  buildDonationsMessagePayload,
  donationsChannelName,
  donationsMessageStateFile,
  donationsPaypalUrl
} from "./donations-panel.js";
import type { BotEnv } from "./bot-config.js";

const donationReadOnlyOverwrite: PermissionOverwriteOptions = {
  ViewChannel: true,
  ReadMessageHistory: true,
  SendMessages: false
};

const donationBotOverwrite: PermissionOverwriteOptions = {
  ViewChannel: true,
  ReadMessageHistory: true,
  SendMessages: true,
  EmbedLinks: true,
  ManageMessages: true
};

export interface DonationsPublishResult {
  channelId: string;
  messageId: string;
  createdChannel: boolean;
  action: "created" | "updated";
  updatedOverwrites: number;
}

interface DonationsMessageState {
  guildId?: string;
  channelId?: string;
  messageId?: string;
}

export async function publishDonationsPanel(
  rootDir: string,
  guild: Guild,
  botMember: GuildMember,
  env: Pick<BotEnv, "MEMBER_ROLE_ID" | "PENDING_MEMBER_ROLE_ID">
): Promise<DonationsPublishResult> {
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new SafeError("El bot necesita ManageChannels para crear o reparar el canal de donaciones.");
  }
  if (botMember.permissions.has(PermissionFlagsBits.Administrator)) {
    throw new SafeError("El bot no debe depender de Administrator para publicar donaciones. Usa permisos explicitos.");
  }

  const desired = await loadDesiredStructure(path.join(rootDir, "config", "server-structure.yml"));
  const ensured = await ensureDonationsChannel(guild, desired);
  const updatedOverwrites = await repairDonationsChannelPermissions(ensured.channel, guild, botMember, env, desired);
  const statePath = path.join(rootDir, "state", donationsMessageStateFile);
  const state = await readJsonFile<DonationsMessageState>(statePath, {});
  const existing = await findExistingDonationsMessage(ensured.channel, state);
  const message = existing
    ? await existing.edit(buildDonationsMessagePayload())
    : await ensured.channel.send(buildDonationsMessagePayload());

  await writeJsonAtomic(statePath, {
    guildId: guild.id,
    channelId: ensured.channel.id,
    messageId: message.id,
    updatedAt: new Date().toISOString()
  });

  return {
    channelId: ensured.channel.id,
    messageId: message.id,
    createdChannel: ensured.created,
    action: existing ? "updated" : "created",
    updatedOverwrites
  };
}

async function ensureDonationsChannel(guild: Guild, desired: DesiredStructure): Promise<{ channel: TextChannel; created: boolean }> {
  const channels = await guild.channels.fetch();
  const existing = channels.find((channel): channel is TextChannel => channel?.type === ChannelType.GuildText && channel.name === donationsChannelName);
  if (existing) {
    return { channel: existing, created: false };
  }

  const configuredCategory = desired.categories.find((category) => isInformationCategoryName(category.name));
  const category = channels.find((channel) => channel?.type === ChannelType.GuildCategory && isInformationCategoryName(channel.name));
  const created = await guild.channels.create({
    name: donationsChannelName,
    type: ChannelType.GuildText,
    parent: category?.id,
    topic: "Aportes voluntarios para hosting, mantenimiento y mejoras del servidor.",
    reason: "Crear canal informativo de donaciones"
  });

  if (!category && configuredCategory) {
    await created.setPosition(configuredCategory.channels.findIndex((channel) => channel.name === donationsChannelName)).catch(() => undefined);
  }

  return { channel: created, created: true };
}

async function repairDonationsChannelPermissions(
  channel: TextChannel,
  guild: Guild,
  botMember: GuildMember,
  env: Pick<BotEnv, "MEMBER_ROLE_ID" | "PENDING_MEMBER_ROLE_ID">,
  desired: DesiredStructure
): Promise<number> {
  const targets = await donationsPermissionOverwrites(guild, botMember, env);
  let updated = 0;
  for (const target of targets) {
    const existing = channel.permissionOverwrites.cache.get(target.id);
    if (permissionOverwriteDiff(existing, target.options).length === 0) {
      continue;
    }
    await channel.permissionOverwrites.edit(target.id, target.options, { reason: "Reparar permisos del canal de donaciones" });
    updated += 1;
  }
  return updated;
}

async function donationsPermissionOverwrites(
  guild: Guild,
  botMember: GuildMember,
  env: Pick<BotEnv, "MEMBER_ROLE_ID" | "PENDING_MEMBER_ROLE_ID">
) {
  return [
    { id: guild.roles.everyone.id, options: donationReadOnlyOverwrite },
    { id: env.MEMBER_ROLE_ID, options: donationReadOnlyOverwrite },
    ...(env.PENDING_MEMBER_ROLE_ID ? [{ id: env.PENDING_MEMBER_ROLE_ID, options: donationReadOnlyOverwrite }] : []),
    { id: botMember.id, options: donationBotOverwrite }
  ];
}

async function findExistingDonationsMessage(channel: TextChannel, state: DonationsMessageState): Promise<Message | null> {
  if (state.channelId === channel.id && state.messageId) {
    const byState = await channel.messages.fetch(state.messageId).catch(() => null);
    if (byState) {
      return byState;
    }
  }
  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  return messages?.find((message) =>
    message.author.id === channel.client.user?.id
    && (
      message.content.includes(donationsPaypalUrl)
      || message.embeds.some((embed) => embed.description?.includes(donationsPaypalUrl))
    )
  ) ?? null;
}
