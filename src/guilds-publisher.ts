import {
  CategoryChannel,
  ChannelType,
  Guild,
  GuildMember,
  OverwriteResolvable,
  PermissionFlagsBits,
  PermissionsBitField,
  Role
} from "discord.js";
import { SafeError } from "./errors.js";
import type { GuildsConfig, GuildSlotConfig } from "./guilds-config.js";

const protectedRoleNames = new Set(["Admin", "Palworld Server Manager", "Bots", "Miembros"]);

export interface PublishGuildsResult {
  createdRoles: string[];
  createdChannels: string[];
  updatedChannels: string[];
}

export async function publishGuilds(guild: Guild, botMember: GuildMember, config: GuildsConfig): Promise<PublishGuildsResult> {
  if (!config.enabled) {
    return { createdRoles: [], createdChannels: [], updatedChannels: [] };
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new SafeError("El bot necesita ManageRoles y ManageChannels para guilds:publish.");
  }
  if (botMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
    throw new SafeError("guilds:publish no debe depender de Administrator.");
  }

  const createdRoles: string[] = [];
  const createdChannels: string[] = [];
  const updatedChannels: string[] = [];
  const category = await ensureCategory(guild, config.categoryName);
  const roles = await guild.roles.fetch();

  for (const slot of config.guilds) {
    if (protectedRoleNames.has(slot.roleName)) {
      throw new SafeError(`El rol protegido "${slot.roleName}" no puede usarse como rol de gremio.`);
    }
    let role = roles.find((candidate) => candidate.name === slot.roleName) ?? null;
    if (!role) {
      role = await guild.roles.create({ name: slot.roleName, permissions: [], mentionable: false, hoist: false, reason: "guilds:publish" });
      roles.set(role.id, role);
      createdRoles.push(role.name);
    }
    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
      throw new SafeError(`El rol mas alto del bot debe estar por encima de "${role.name}".`);
    }

    for (const spec of [
      { name: slot.textChannelName, type: ChannelType.GuildText },
      { name: slot.voiceChannelName, type: ChannelType.GuildVoice }
    ] as const) {
      const existing = (await guild.channels.fetch()).find((channel) => channel?.name === spec.name && channel.type === spec.type);
      const overwrites = config.privateChannels ? await guildChannelOverwrites(guild, config, role) : undefined;
      if (!existing) {
        await guild.channels.create({
          name: spec.name,
          type: spec.type,
          parent: category.id,
          permissionOverwrites: overwrites,
          reason: "guilds:publish"
        });
        createdChannels.push(spec.name);
      } else if (config.privateChannels && "permissionOverwrites" in existing) {
        await existing.permissionOverwrites.set(overwrites ?? [], "guilds:publish");
        updatedChannels.push(spec.name);
      }
    }
  }

  return { createdRoles, createdChannels, updatedChannels };
}

async function ensureCategory(guild: Guild, name: string): Promise<CategoryChannel> {
  const channels = await guild.channels.fetch();
  const existing = channels.find((channel): channel is CategoryChannel => channel?.type === ChannelType.GuildCategory && channel.name === name);
  if (existing) {
    return existing;
  }
  return await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: "guilds:publish" });
}

async function guildChannelOverwrites(guild: Guild, config: GuildsConfig, guildRole: Role): Promise<OverwriteResolvable[]> {
  const roles = await guild.roles.fetch();
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: guildRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
  ];
  for (const roleName of config.managerRoleNames) {
    const role = roles.find((candidate) => candidate.name === roleName);
    if (role) {
      overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
    }
  }
  return overwrites;
}

export function guildRoleNames(config: GuildsConfig): string[] {
  return config.guilds.map((guild) => guild.roleName);
}

export function findGuildSlot(config: GuildsConfig, idOrName: string): GuildSlotConfig | undefined {
  return config.guilds.find((guild) => guild.id === idOrName || guild.roleName.toLowerCase() === idOrName.toLowerCase());
}
