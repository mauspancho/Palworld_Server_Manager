import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder
} from "discord.js";
import type { ResolvedSelfRoleGroup } from "./self-roles-types.js";

export const selfRoleCustomIdPrefix = "self-role:";

export function selfRoleCustomId(groupId: string): string {
  return `${selfRoleCustomIdPrefix}${groupId}`;
}

export function buildSelfRolesEmbed(groups: ResolvedSelfRoleGroup[]): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Seleccion de roles")
    .setDescription(
      [
        "Usa los menus para elegir tus plataformas, notificaciones y estilo de juego.",
        "Puedes cambiar tus elecciones en cualquier momento."
      ].join("\n")
    )
    .addFields(groups.map((group) => ({
      name: group.title,
      value: group.description
    })))
    .setTimestamp(new Date());
}

export function buildSelfRoleComponents(groups: ResolvedSelfRoleGroup[]): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return groups.map((group) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(selfRoleCustomId(group.id))
      .setPlaceholder(group.title)
      .setMinValues(group.minValues)
      .setMaxValues(group.maxValues)
      .setOptions(group.roles.map((role) => ({
        label: role.name,
        value: role.id,
        description: role.description,
        emoji: role.emoji
      })));

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  });
}
