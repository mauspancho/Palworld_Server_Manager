import {
  CategoryChannel,
  ChannelType,
  Guild,
  GuildMember,
  OverwriteResolvable,
  PermissionFlagsBits,
  PermissionsBitField,
  Role,
  TextChannel,
  VoiceChannel
} from "discord.js";
import type { BotEnv } from "./bot-config.js";
import { SafeError } from "./errors.js";
import type { GuildsConfig } from "./guilds-config.js";
import {
  guildRoleName,
  guildTextChannelName,
  guildVoiceChannelName
} from "./guilds-logic.js";
import type { GuildCommunityRecord } from "./guilds-types.js";

const protectedRoleNames = new Set(["Admin", "Palworld Server Manager", "Bots", "Miembros"]);

export interface EnsureGuildCommunityResult {
  record: GuildCommunityRecord;
  createdRole: boolean;
  createdTextChannel: boolean;
  createdVoiceChannel: boolean;
}

export async function ensureGuildCommunityResources(
  guild: Guild,
  botMember: GuildMember,
  config: GuildsConfig,
  record: GuildCommunityRecord
): Promise<EnsureGuildCommunityResult> {
  validateGuildCommunityPublisherPermissions(botMember);
  const category = await ensureCategory(guild, config.categoryName);
  const role = await ensureGuildRole(guild, botMember, record);
  const text = await ensureGuildChannel(guild, config, category, role.role, guildTextChannelName(record.name), ChannelType.GuildText);
  const voice = await ensureGuildChannel(guild, config, category, role.role, guildVoiceChannelName(record.name), ChannelType.GuildVoice);

  return {
    record: {
      ...record,
      roleId: role.role.id,
      textChannelId: text.channel.id,
      voiceChannelId: voice.channel.id
    },
    createdRole: role.created,
    createdTextChannel: text.created,
    createdVoiceChannel: voice.created
  };
}

export function validateGuildCommunityPublisherPermissions(botMember: GuildMember): void {
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new SafeError("El bot necesita ManageRoles y ManageChannels para crear gremios privados.");
  }
  if (botMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
    throw new SafeError("La gestion de gremios no debe depender de Administrator.");
  }
}

export async function fetchGuildRequestChannel(
  guild: Guild,
  botMember: GuildMember,
  config: GuildsConfig,
  env: Pick<BotEnv, "GUILD_REQUEST_CHANNEL_ID">
): Promise<TextChannel> {
  if (!env.GUILD_REQUEST_CHANNEL_ID) {
    throw new SafeError("GUILD_REQUEST_CHANNEL_ID no esta configurado.");
  }
  const channel = await guild.channels.fetch(env.GUILD_REQUEST_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new SafeError("GUILD_REQUEST_CHANNEL_ID debe corresponder a un canal de texto existente.");
  }
  if (channel.guild.id !== guild.id) {
    throw new SafeError("GUILD_REQUEST_CHANNEL_ID no pertenece al servidor configurado.");
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new SafeError("El bot necesita ManageChannels para asegurar la privacidad del canal de solicitudes de gremio.");
  }
  const overwrites = await guildRequestChannelOverwrites(guild, config, botMember);
  await channel.permissionOverwrites.set(overwrites, "Asegurar canal privado de solicitudes de gremio");
  return channel;
}

async function ensureGuildRole(
  guild: Guild,
  botMember: GuildMember,
  record: GuildCommunityRecord
): Promise<{ role: Role; created: boolean }> {
  const expectedName = guildRoleName(record.name);
  if (protectedRoleNames.has(expectedName)) {
    throw new SafeError(`El rol protegido "${expectedName}" no puede usarse como rol de gremio.`);
  }
  const roles = await guild.roles.fetch();
  let role = record.roleId ? await guild.roles.fetch(record.roleId).catch(() => null) : null;
  role ??= roles.find((candidate) => candidate.name === expectedName) ?? null;
  if (!role) {
    role = await guild.roles.create({ name: expectedName, permissions: [], mentionable: false, hoist: false, reason: "Crear gremio aprobado" });
    return { role, created: true };
  }
  if (role.managed) {
    throw new SafeError(`El rol "${role.name}" esta administrado por una integracion y no puede usarse para gremio.`);
  }
  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    throw new SafeError(`El rol mas alto del bot debe estar por encima de "${role.name}".`);
  }
  return { role, created: false };
}

async function ensureCategory(guild: Guild, name: string): Promise<CategoryChannel> {
  const channels = await guild.channels.fetch();
  const existing = channels.find((channel): channel is CategoryChannel => channel?.type === ChannelType.GuildCategory && channel.name === name);
  if (existing) {
    return existing;
  }
  return await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: "Crear categoria de gremios" });
}

async function ensureGuildChannel<TType extends ChannelType.GuildText | ChannelType.GuildVoice>(
  guild: Guild,
  config: GuildsConfig,
  category: CategoryChannel,
  role: Role,
  name: string,
  type: TType
): Promise<{ channel: TType extends ChannelType.GuildText ? TextChannel : VoiceChannel; created: boolean }> {
  const channels = await guild.channels.fetch();
  const existing = channels.find((channel) => channel?.name === name && channel.type === type) as (TType extends ChannelType.GuildText ? TextChannel : VoiceChannel) | undefined;
  const overwrites = await guildCommunityOverwrites(guild, config, role);
  if (existing) {
    await existing.permissionOverwrites.set(overwrites, "Actualizar permisos privados de gremio");
    if (existing.parentId !== category.id) {
      await existing.setParent(category.id, { lockPermissions: false, reason: "Mover canal a categoria de gremios" });
    }
    return { channel: existing, created: false };
  }
  const channel = await guild.channels.create({
    name,
    type,
    parent: category.id,
    permissionOverwrites: overwrites,
    reason: "Crear canal privado de gremio"
  });
  return { channel: channel as unknown as TType extends ChannelType.GuildText ? TextChannel : VoiceChannel, created: true };
}

async function guildCommunityOverwrites(guild: Guild, config: GuildsConfig, guildRole: Role): Promise<OverwriteResolvable[]> {
  const roles = await guild.roles.fetch();
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: guildRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ]
    }
  ];
  for (const roleName of config.managerRoleNames) {
    const role = roles.find((candidate) => candidate.name === roleName);
    if (role) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak
        ]
      });
    }
  }
  return overwrites;
}

async function guildRequestChannelOverwrites(guild: Guild, config: GuildsConfig, botMember: GuildMember): Promise<OverwriteResolvable[]> {
  const roles = await guild.roles.fetch();
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];
  for (const roleName of config.authorizedRoleNames) {
    const role = roles.find((candidate) => candidate.name === roleName);
    if (role) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }
  }
  return overwrites;
}
