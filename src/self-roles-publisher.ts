import {
  ChannelType,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  PermissionsBitField,
  Role,
  TextChannel
} from "discord.js";
import type { SelfRolesConfig, ResolvedSelfRoleGroup, SelfRoleMessageState } from "./self-roles-types.js";
import { SafeError } from "./errors.js";
import { isProtectedRoleName } from "./self-roles-config.js";
import { buildSelfRoleComponents, buildSelfRolesEmbed } from "./self-roles-components.js";
import { readSelfRolesMessageState, writeSelfRolesMessageState } from "./self-roles-state.js";

const managerRoleName = "Palworld Server Manager";

export interface PublishSelfRolesResult {
  action: "created" | "updated";
  messageId: string;
  createdRoleNames: string[];
}

export async function publishSelfRoles(
  rootDir: string,
  guild: Guild,
  botMember: GuildMember,
  config: SelfRolesConfig,
  rolesChannelId: string
): Promise<PublishSelfRolesResult> {
  const channel = await fetchRolesChannel(guild, rolesChannelId);
  validatePublisherPermissions(botMember, channel);
  const managerRole = await findRequiredRole(guild, managerRoleName);
  const { groups, createdRoleNames } = await ensureSelfRoles(guild, botMember, managerRole, config);
  const payload = {
    embeds: [buildSelfRolesEmbed(groups)],
    components: buildSelfRoleComponents(groups)
  };

  const previousState = await readSelfRolesMessageState(rootDir);
  const previousMessage = previousState?.channelId === channel.id
    ? await channel.messages.fetch(previousState.messageId).catch(() => null)
    : null;

  if (previousMessage && previousMessage.author.id === botMember.id) {
    const message = await previousMessage.edit(payload);
    await writeSelfRolesMessageState(rootDir, createState(guild.id, channel.id, message.id));
    return { action: "updated", messageId: message.id, createdRoleNames };
  }

  const message = await channel.send(payload);
  await writeSelfRolesMessageState(rootDir, createState(guild.id, channel.id, message.id));
  return { action: "created", messageId: message.id, createdRoleNames };
}

export function decidePublishAction(state: SelfRoleMessageState | null, messageExists: boolean): "create" | "update" {
  return state && messageExists ? "update" : "create";
}

async function fetchRolesChannel(guild: Guild, rolesChannelId: string): Promise<TextChannel> {
  const channel = await guild.channels.fetch(rolesChannelId).catch(() => null);
  if (!channel) {
    throw new SafeError("ROLES_CHANNEL_ID no corresponde a un canal existente.");
  }
  if (channel.type !== ChannelType.GuildText) {
    throw new SafeError("ROLES_CHANNEL_ID debe ser un canal de texto.");
  }
  return channel;
}

function validatePublisherPermissions(botMember: GuildMember, channel: TextChannel): void {
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new SafeError("El bot necesita ManageRoles para publicar self-roles.");
  }
  if (botMember.permissions.has(PermissionFlagsBits.Administrator)) {
    throw new SafeError("El bot no debe depender de Administrator para roles:publish. Usa permisos explicitos.");
  }
  const channelPermissions = channel.permissionsFor(botMember);
  if (!channelPermissions.has(PermissionFlagsBits.SendMessages) || !channelPermissions.has(PermissionFlagsBits.ViewChannel)) {
    throw new SafeError("El bot necesita ViewChannel y SendMessages en ROLES_CHANNEL_ID.");
  }
}

async function ensureSelfRoles(
  guild: Guild,
  botMember: GuildMember,
  managerRole: Role,
  config: SelfRolesConfig
): Promise<{ groups: ResolvedSelfRoleGroup[]; createdRoleNames: string[] }> {
  const createdRoleNames: string[] = [];
  const resolvedGroups: ResolvedSelfRoleGroup[] = [];
  const roles = await guild.roles.fetch();

  for (const group of config.groups) {
    const resolvedRoles = [];
    for (const configuredRole of group.roles) {
      if (isProtectedRoleName(configuredRole.name)) {
        throw new SafeError(`No se permite configurar el rol protegido "${configuredRole.name}" como self-role.`);
      }

      const matches = roles.filter((role) => role.name === configuredRole.name);
      if (matches.size > 1) {
        throw new SafeError(`Hay roles duplicados llamados "${configuredRole.name}" en Discord. Corrigelo antes de publicar.`);
      }

      let role = matches.first() ?? null;
      if (!role) {
        role = await guild.roles.create({
          name: configuredRole.name,
          permissions: [],
          mentionable: false,
          hoist: false,
          reason: "roles:publish self-role"
        });
        roles.set(role.id, role);
        createdRoleNames.push(role.name);
      }

      validateSelectableRole(botMember, managerRole, role);
      resolvedRoles.push({
        id: role.id,
        name: configuredRole.name,
        description: configuredRole.description,
        emoji: configuredRole.emoji
      });
    }

    resolvedGroups.push({
      id: group.id,
      title: group.title,
      description: group.description,
      minValues: group.minValues,
      maxValues: group.maxValues,
      roles: resolvedRoles
    });
  }

  return { groups: resolvedGroups, createdRoleNames };
}

function validateSelectableRole(botMember: GuildMember, managerRole: Role, role: Role): void {
  if (role.managed) {
    throw new SafeError(`El rol "${role.name}" es administrado por una integracion y no puede usarse como self-role.`);
  }
  if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
    throw new SafeError(`El rol "${role.name}" tiene Administrator y no puede usarse como self-role.`);
  }
  if (role.position >= managerRole.position) {
    throw new SafeError(`El rol "${role.name}" debe estar debajo de ${managerRoleName}.`);
  }
  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    throw new SafeError(`El rol mas alto del bot debe estar por encima de "${role.name}".`);
  }
}

async function findRequiredRole(guild: Guild, roleName: string): Promise<Role> {
  const roles = await guild.roles.fetch();
  const role = roles.find((candidate) => candidate.name === roleName);
  if (!role) {
    throw new SafeError(`No existe el rol requerido "${roleName}".`);
  }
  return role;
}

function createState(guildId: string, channelId: string, messageId: string): SelfRoleMessageState {
  return {
    guildId,
    channelId,
    messageId,
    updatedAt: new Date().toISOString()
  };
}
