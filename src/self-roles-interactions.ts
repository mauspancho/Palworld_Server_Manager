import {
  Collection,
  GuildMember,
  MessageFlags,
  PermissionsBitField,
  Role,
  Snowflake,
  StringSelectMenuInteraction
} from "discord.js";
import type { BotEnv } from "./bot-config.js";
import { calculateRoleChanges } from "./self-roles-logic.js";
import { loadSelfRolesConfig } from "./self-roles-config.js";
import { selfRoleCustomIdPrefix } from "./self-roles-components.js";
import { readSelfRolesMessageState, selfRolesConfigPath } from "./self-roles-state.js";

const protectedRoleNames = new Set(["Admin", "Palworld Server Manager", "Bots"]);

export async function handleSelfRoleInteraction(
  interaction: StringSelectMenuInteraction,
  env: BotEnv,
  rootDir: string
): Promise<void> {
  if (!interaction.customId.startsWith(selfRoleCustomIdPrefix)) {
    return;
  }
  if (!interaction.guild || interaction.guildId !== env.DISCORD_GUILD_ID) {
    return;
  }
  if (interaction.user.bot) {
    return;
  }

  const state = await readSelfRolesMessageState(rootDir);
  if (!state || state.guildId !== interaction.guildId || state.channelId !== interaction.channelId || state.messageId !== interaction.message.id) {
    await replyEphemeral(interaction, "Este menu de roles no esta activo. Usa el mensaje publicado por el bot.");
    return;
  }

  const groupId = interaction.customId.slice(selfRoleCustomIdPrefix.length);
  const config = await loadSelfRolesConfig(selfRolesConfigPath(rootDir));
  const group = config.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    await replyEphemeral(interaction, "Este grupo de roles ya no existe en la configuracion.");
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const roles = await interaction.guild.roles.fetch();
  const groupRoles = group.roles
    .map((configuredRole) => roles.find((role) => role.name === configuredRole.name) ?? null)
    .filter((role): role is Role => role !== null)
    .filter((role) => isAssignableSelfRole(role, env));

  const changes = calculateRoleChanges(
    groupRoles.map((role) => role.id),
    [...member.roles.cache.keys()],
    interaction.values,
    protectedRoleIds(roles, env)
  );

  const addedNames = groupRoles.filter((role) => changes.addRoleIds.includes(role.id)).map((role) => role.name);
  const removedNames = groupRoles.filter((role) => changes.removeRoleIds.includes(role.id)).map((role) => role.name);

  try {
    if (changes.addRoleIds.length > 0) {
      await member.roles.add(changes.addRoleIds, "Self-role seleccionado por menu");
    }
    if (changes.removeRoleIds.length > 0) {
      await member.roles.remove(changes.removeRoleIds, "Self-role retirado por menu");
    }
  } catch {
    await replyEphemeral(interaction, "No pude actualizar tus roles por permisos. Un administrador debe revisar la jerarquia del bot.");
    return;
  }

  await replyEphemeral(interaction, formatRoleChangeReply(addedNames, removedNames));
}

export function isAssignableSelfRole(role: Role, env: BotEnv): boolean {
  if (role.id === env.MEMBER_ROLE_ID) {
    return false;
  }
  if (protectedRoleNames.has(role.name)) {
    return false;
  }
  if (role.managed) {
    return false;
  }
  if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return false;
  }
  return true;
}

export function formatRoleChangeReply(addedRoleNames: string[], removedRoleNames: string[]): string {
  const added = addedRoleNames.length > 0 ? addedRoleNames.join(", ") : "ninguno";
  const removed = removedRoleNames.length > 0 ? removedRoleNames.join(", ") : "ninguno";
  return `Roles agregados: ${added}\nRoles retirados: ${removed}`;
}

function protectedRoleIds(roles: Collection<Snowflake, Role>, env: BotEnv): string[] {
  const ids = [env.MEMBER_ROLE_ID];
  for (const role of roles.values()) {
    if (protectedRoleNames.has(role.name) || role.managed || role.permissions.has(PermissionsBitField.Flags.Administrator)) {
      ids.push(role.id);
    }
  }
  return ids;
}

async function replyEphemeral(interaction: StringSelectMenuInteraction, content: string): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
