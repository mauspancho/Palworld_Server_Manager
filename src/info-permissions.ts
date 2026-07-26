import {
  ChannelType,
  Guild,
  GuildMember,
  Message,
  MessageCreateOptions,
  PermissionFlagsBits,
  PermissionOverwriteOptions,
  Role,
  CategoryChannel,
  TextChannel
} from "discord.js";
import path from "node:path";
import type { BotEnv } from "./bot-config.js";
import { loadDesiredStructure } from "./config.js";
import type { DesiredStructure } from "./domain.js";
import { SafeError } from "./errors.js";

export const informationChannelSlugs = [
  "bienvenida",
  "reglas",
  "anuncios",
  "datos-del-servidor",
  "elige-tus-roles"
] as const;

const defaultAdministrativeRoleNames = ["Admin", "Palworld Server Manager", "Moderador"];
const authorizedBotRoleNames = ["Bots", "Palworld Server Manager"];

export interface InformationPermissionTarget {
  id: string;
  label: string;
  options: PermissionOverwriteOptions;
}

export interface InformationRepairResult {
  checkedChannels: number;
  updatedOverwrites: number;
  unchangedOverwrites: number;
  missingChannels: string[];
  errors: string[];
}

export interface InformationProtectionResult {
  handled: boolean;
  deleted: boolean;
  warned: boolean;
  reason: string;
}

export interface InformationPermissionValidationResult {
  errors: string[];
  warnings: string[];
}

interface PermissionOverwriteLike {
  allow: { has(permission: bigint): boolean };
  deny: { has(permission: bigint): boolean };
}

interface RepairOptions {
  rootDir?: string;
  reason?: string;
  log?: (message: string, details?: unknown) => Promise<void>;
}

const readOnlyOverwrite: PermissionOverwriteOptions = {
  ViewChannel: true,
  ReadMessageHistory: true,
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AttachFiles: false,
  SendVoiceMessages: false,
  UseApplicationCommands: false,
  MentionEveryone: false,
  ManageMessages: false,
  ManageThreads: false,
  ManageChannels: false,
  CreateInstantInvite: false
};

const publisherOverwrite: PermissionOverwriteOptions = {
  ViewChannel: true,
  ReadMessageHistory: true,
  SendMessages: true,
  EmbedLinks: true,
  AttachFiles: true,
  ManageMessages: true,
  ManageThreads: true,
  CreatePublicThreads: true,
  CreatePrivateThreads: true,
  SendMessagesInThreads: true,
  UseApplicationCommands: true
};

export function administrativeRoleNamesFromStructure(desired?: DesiredStructure): string[] {
  return uniqueNames([...(desired?.administrativeRoleNames ?? []), ...defaultAdministrativeRoleNames]);
}

export function informationPermissionTargets(input: {
  guildId: string;
  memberRoleId?: string;
  pendingMemberRoleId?: string;
  adminRoleIds?: Array<{ id: string; name: string }>;
  botUserId?: string;
  botRoleIds?: Array<{ id: string; name: string }>;
}): InformationPermissionTarget[] {
  const targets: InformationPermissionTarget[] = [
    { id: input.guildId, label: "@everyone", options: readOnlyOverwrite }
  ];

  if (input.memberRoleId) {
    targets.push({ id: input.memberRoleId, label: "MEMBER_ROLE_ID", options: readOnlyOverwrite });
  }
  if (input.pendingMemberRoleId) {
    targets.push({ id: input.pendingMemberRoleId, label: "PENDING_MEMBER_ROLE_ID", options: readOnlyOverwrite });
  }
  for (const role of input.adminRoleIds ?? []) {
    targets.push({ id: role.id, label: role.name, options: publisherOverwrite });
  }
  for (const role of input.botRoleIds ?? []) {
    targets.push({ id: role.id, label: role.name, options: publisherOverwrite });
  }
  if (input.botUserId) {
    targets.push({ id: input.botUserId, label: "bot", options: publisherOverwrite });
  }

  return uniqueTargets(targets);
}

export function permissionOverwriteDiff(existing: PermissionOverwriteLike | undefined, options: PermissionOverwriteOptions): string[] {
  const diff: string[] = [];
  for (const [key, value] of Object.entries(options) as Array<[keyof typeof PermissionFlagsBits, boolean | null]>) {
    const flag = PermissionFlagsBits[key];
    if (value === true && (!existing?.allow.has(flag) || existing.deny.has(flag))) {
      diff.push(key);
    }
    if (value === false && (existing?.allow.has(flag) || !existing?.deny.has(flag))) {
      diff.push(key);
    }
    if (value === null && (existing?.allow.has(flag) || existing?.deny.has(flag))) {
      diff.push(key);
    }
  }
  return diff;
}

export function isInformationChannelName(name: string): boolean {
  const normalized = normalizeName(name);
  return informationChannelSlugs.some((slug) => normalized.includes(slug));
}

export function isInformationCategoryName(name: string): boolean {
  return normalizeName(name).includes("informaci");
}

export function canPublishInInformationChannel(roleNames: string[], desired?: DesiredStructure, isBot = false): boolean {
  const allowed = new Set([
    ...administrativeRoleNamesFromStructure(desired),
    ...(isBot ? authorizedBotRoleNames : [])
  ]);
  return roleNames.some((roleName) => allowed.has(roleName));
}

export function buildInformationReadOnlyNotice(guildId: string, generalChannelId: string): MessageCreateOptions {
  return {
    content: [
      "Ese canal es solo informativo y no permite mensajes de usuarios.",
      `Puedes participar en <#${generalChannelId}>.`,
      `Enlace directo: https://discord.com/channels/${guildId}/${generalChannelId}`
    ].join("\n")
  };
}

export function formatInformationRepairResult(result: InformationRepairResult): string {
  const lines = [
    `Canales revisados: ${result.checkedChannels}`,
    `Overwrites actualizados: ${result.updatedOverwrites}`,
    `Overwrites sin cambios: ${result.unchangedOverwrites}`
  ];
  if (result.missingChannels.length > 0) {
    lines.push(`Canales no encontrados: ${result.missingChannels.join(", ")}`);
  }
  if (result.errors.length > 0) {
    lines.push(`Errores: ${result.errors.join(" | ")}`);
  }
  return lines.join("\n");
}

export async function repairInformationPermissions(
  guild: Guild,
  botMember: GuildMember,
  env: BotEnv,
  desired: DesiredStructure,
  options: RepairOptions = {}
): Promise<InformationRepairResult> {
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new SafeError("El bot necesita ManageChannels para reparar permisos de canales informativos.");
  }
  if (botMember.permissions.has(PermissionFlagsBits.Administrator)) {
    throw new SafeError("El bot no debe depender de Administrator para reparar permisos informativos. Usa permisos explicitos.");
  }

  const roles = await guild.roles.fetch();
  const adminNames = new Set(administrativeRoleNamesFromStructure(desired));
  const adminRoleIds = roles
    .filter((role) => adminNames.has(role.name) && !role.managed)
    .map((role) => ({ id: role.id, name: role.name }));
  const botRoleIds = roles
    .filter((role) => authorizedBotRoleNames.includes(role.name) && !role.managed)
    .map((role) => ({ id: role.id, name: role.name }));
  const targets = informationPermissionTargets({
    guildId: guild.id,
    memberRoleId: env.MEMBER_ROLE_ID,
    pendingMemberRoleId: env.PENDING_MEMBER_ROLE_ID,
    adminRoleIds,
    botRoleIds,
    botUserId: botMember.id
  });
  const result: InformationRepairResult = {
    checkedChannels: 0,
    updatedOverwrites: 0,
    unchangedOverwrites: 0,
    missingChannels: [],
    errors: []
  };

  const category = await findInformationCategory(guild);
  if (category) {
    await applyTargetsToChannel(category, targets, result, options);
  }

  const configuredChannels = informationChannelsFromStructure(desired);
  const textChannels = await fetchGuildTextChannels(guild);
  for (const slug of configuredChannels) {
    const channel = textChannels.find((candidate) => normalizeName(candidate.name).includes(slug));
    if (!channel) {
      result.missingChannels.push(slug);
      await options.log?.("Canal informativo no encontrado.", { slug });
      continue;
    }
    result.checkedChannels += 1;
    await applyTargetsToChannel(channel, targets, result, options);
  }

  await options.log?.("Reparacion de permisos informativos finalizada.", result);
  return result;
}

export async function validateInformationPermissionConfiguration(
  guild: Guild,
  botMember: GuildMember,
  desired: DesiredStructure
): Promise<InformationPermissionValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    errors.push("El bot necesita ManageChannels para reparar permisos de canales informativos.");
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
    warnings.push("El bot necesita ManageMessages para retirar mensajes no autorizados en canales informativos; la proteccion informativa seguira activa pero no podra borrar mensajes hasta corregir permisos.");
  }
  if (botMember.permissions.has(PermissionFlagsBits.Administrator)) {
    errors.push("El bot no debe depender de Administrator para canales informativos.");
  }

  const textChannels = await fetchGuildTextChannels(guild);
  for (const slug of informationChannelsFromStructure(desired)) {
    const channel = textChannels.find((candidate) => normalizeName(candidate.name).includes(slug));
    if (!channel) {
      warnings.push(`Canal informativo no encontrado: ${slug}.`);
      continue;
    }
    const permissions = channel.permissionsFor(botMember);
    if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
      errors.push(`El bot no puede ver el canal informativo ${channel.name}.`);
    }
    if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
      errors.push(`El bot no puede publicar en el canal informativo ${channel.name}.`);
    }
    if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
      warnings.push(`El bot no puede moderar mensajes en el canal informativo ${channel.name}; no podra retirar mensajes no autorizados en ese canal.`);
    }
  }

  return { errors, warnings };
}

export async function handleInformationChannelMessage(
  message: Message,
  env: BotEnv,
  rootDir = process.cwd()
): Promise<InformationProtectionResult> {
  if (!message.guild || message.guild.id !== env.DISCORD_GUILD_ID) {
    return { handled: false, deleted: false, warned: false, reason: "other-guild" };
  }
  if (!message.channel || message.channel.type !== ChannelType.GuildText || !isInformationChannelName(message.channel.name)) {
    return { handled: false, deleted: false, warned: false, reason: "not-information-channel" };
  }
  if (message.author.id === message.client.user?.id) {
    return { handled: false, deleted: false, warned: false, reason: "own-message" };
  }

  const desired = await loadDesiredStructure(path.join(rootDir, "config", "server-structure.yml")).catch(() => undefined);
  const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) {
    return { handled: false, deleted: false, warned: false, reason: "member-not-found" };
  }

  const roleNames = member.roles.cache.map((role: Role) => role.name);
  if (canPublishInInformationChannel(roleNames, desired, message.author.bot)) {
    return { handled: false, deleted: false, warned: false, reason: "authorized" };
  }

  let deleted = false;
  let warned = false;
  if (message.deletable) {
    await message.delete().then(() => {
      deleted = true;
    }).catch(() => {
      deleted = false;
    });
  }

  await message.author.send(buildInformationReadOnlyNotice(message.guild.id, env.GENERAL_CHAT_CHANNEL_ID)).then(() => {
    warned = true;
  }).catch(() => {
    warned = false;
  });

  await logInformationMessageRemoval(message, env, deleted, warned);
  return { handled: true, deleted, warned, reason: "protected-information-channel" };
}

async function findInformationCategory(guild: Guild): Promise<CategoryChannel | null> {
  const channels = await guild.channels.fetch();
  return channels.find((channel): channel is CategoryChannel => channel !== null && channel.type === ChannelType.GuildCategory && isInformationCategoryName(channel.name)) ?? null;
}

async function fetchGuildTextChannels(guild: Guild): Promise<TextChannel[]> {
  const channels = await guild.channels.fetch();
  return channels
    .filter((channel): channel is TextChannel => channel !== null && channel.type === ChannelType.GuildText)
    .map((channel) => channel);
}

async function applyTargetsToChannel(
  channel: CategoryChannel | TextChannel,
  targets: InformationPermissionTarget[],
  result: InformationRepairResult,
  options: RepairOptions
): Promise<void> {
  if (!("permissionOverwrites" in channel)) {
    return;
  }
  for (const target of targets) {
    const existing = channel.permissionOverwrites.cache.get(target.id);
    const diff = permissionOverwriteDiff(existing, target.options);
    if (diff.length === 0) {
      result.unchangedOverwrites += 1;
      continue;
    }
    try {
      await channel.permissionOverwrites.edit(target.id, target.options, {
        reason: options.reason ?? "Reparar permisos de canales informativos"
      });
      result.updatedOverwrites += 1;
      await options.log?.("Overwrite informativo actualizado.", {
        channelId: channel.id,
        channelName: channel.name,
        target: target.label,
        permissions: diff
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${channel.name}/${target.label}: ${message}`);
      await options.log?.("Error actualizando overwrite informativo.", {
        channelId: channel.id,
        channelName: channel.name,
        target: target.label,
        error: message
      });
    }
  }
}

function informationChannelsFromStructure(desired: DesiredStructure): string[] {
  const configured = desired.categories
    .filter((category) => isInformationCategoryName(category.name))
    .flatMap((category) => category.channels)
    .filter((channel) => channel.type === "text")
    .map((channel) => normalizeName(channel.name))
    .flatMap((name) => informationChannelSlugs.filter((slug) => name.includes(slug)));
  return configured.length > 0 ? uniqueNames(configured) : [...informationChannelSlugs];
}

async function logInformationMessageRemoval(message: Message, env: BotEnv, deleted: boolean, warned: boolean): Promise<void> {
  const logChannel = await message.guild?.channels.fetch(env.MEMBER_LOG_CHANNEL_ID).catch(() => null);
  if (!logChannel || logChannel.type !== ChannelType.GuildText) {
    return;
  }
  await logChannel.send({
    content: [
      `Proteccion informativa: <@${message.author.id}> intento escribir en <#${message.channel.id}>.`,
      `Eliminado=${String(deleted)} DM=${String(warned)}`
    ].join(" ")
  }).catch(() => undefined);
}

function uniqueNames(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueTargets(targets: InformationPermissionTarget[]): InformationPermissionTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    if (seen.has(target.id)) {
      return false;
    }
    seen.add(target.id);
    return true;
  });
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/_/g, "-");
}
