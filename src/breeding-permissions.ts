import {
  Guild,
  GuildMember,
  PermissionFlagsBits,
  PermissionOverwriteOptions,
  Role,
  TextChannel
} from "discord.js";
import type { BotEnv } from "./bot-config.js";
import { SafeError } from "./errors.js";
import { permissionOverwriteDiff } from "./info-permissions.js";

const publisherRoleNames = ["Admin", "Palworld Server Manager", "Moderador", "Bots"];

export interface BreedingPermissionRepairResult {
  updatedOverwrites: number;
  unchangedOverwrites: number;
  errors: string[];
}

const readOnlyBreedingOverwrite: PermissionOverwriteOptions = {
  ViewChannel: true,
  ReadMessageHistory: true,
  UseApplicationCommands: true,
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AttachFiles: false,
  SendVoiceMessages: false,
  MentionEveryone: false,
  ManageMessages: false,
  ManageThreads: false,
  ManageChannels: false,
  CreateInstantInvite: false
};

const publisherBreedingOverwrite: PermissionOverwriteOptions = {
  ViewChannel: true,
  ReadMessageHistory: true,
  UseApplicationCommands: true,
  SendMessages: true,
  EmbedLinks: true,
  AttachFiles: true,
  ManageMessages: true
};

export async function repairBreedingChannelPermissions(
  guild: Guild,
  botMember: GuildMember,
  channel: TextChannel,
  env: BotEnv
): Promise<BreedingPermissionRepairResult> {
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new SafeError("El bot necesita ManageChannels para reparar permisos del canal de crianza.");
  }
  if (botMember.permissions.has(PermissionFlagsBits.Administrator)) {
    throw new SafeError("El bot no debe depender de Administrator para reparar el canal de crianza.");
  }

  const roles = await guild.roles.fetch();
  const targets = [
    { id: guild.id, label: "@everyone", options: readOnlyBreedingOverwrite },
    { id: env.MEMBER_ROLE_ID, label: "MEMBER_ROLE_ID", options: readOnlyBreedingOverwrite },
    ...(env.PENDING_MEMBER_ROLE_ID ? [{ id: env.PENDING_MEMBER_ROLE_ID, label: "PENDING_MEMBER_ROLE_ID", options: readOnlyBreedingOverwrite }] : []),
    ...roles
      .filter((role: Role) => publisherRoleNames.includes(role.name) && !role.managed)
      .map((role: Role) => ({ id: role.id, label: role.name, options: publisherBreedingOverwrite })),
    { id: botMember.id, label: "bot", options: publisherBreedingOverwrite }
  ];
  const uniqueTargets = targets.filter((target, index, all) => all.findIndex((candidate) => candidate.id === target.id) === index);
  const result: BreedingPermissionRepairResult = { updatedOverwrites: 0, unchangedOverwrites: 0, errors: [] };

  for (const target of uniqueTargets) {
    const diff = permissionOverwriteDiff(channel.permissionOverwrites.cache.get(target.id), target.options);
    if (diff.length === 0) {
      result.unchangedOverwrites += 1;
      continue;
    }
    try {
      await channel.permissionOverwrites.edit(target.id, target.options, { reason: "Reparar permisos del panel de crianza" });
      result.updatedOverwrites += 1;
    } catch (error) {
      result.errors.push(`${channel.name}/${target.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

export function validateBreedingChannelPermissions(botMember: GuildMember, channel: TextChannel): string[] {
  const errors: string[] = [];
  const botPermissions = channel.permissionsFor(botMember);
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    errors.push("El bot necesita ManageChannels para reparar el canal de crianza.");
  }
  if (!botPermissions.has(PermissionFlagsBits.ViewChannel) || !botPermissions.has(PermissionFlagsBits.SendMessages)) {
    errors.push("El bot necesita ViewChannel y SendMessages en BREEDING_CHANNEL_ID.");
  }
  if (!botPermissions.has(PermissionFlagsBits.ManageMessages)) {
    errors.push("El bot necesita ManageMessages en BREEDING_CHANNEL_ID para administrar su panel.");
  }
  if (botMember.permissions.has(PermissionFlagsBits.Administrator)) {
    errors.push("El bot no debe depender de Administrator para el panel de crianza.");
  }
  return errors;
}
