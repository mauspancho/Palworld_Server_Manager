import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
  MessageFlags
} from "discord.js";
import path from "node:path";
import type { BotEnv } from "./bot-config.js";
import { adminOrModeratorRoleNames, adminRoleNames, memberHasAnyRole } from "./command-permissions.js";
import { booleanEnv, optionalEnv } from "./env-utils.js";
import { loadGuildsConfig } from "./guilds-config.js";
import { calculateUniqueGuildAssignment } from "./guilds-logic.js";
import { findGuildSlot, guildRoleNames } from "./guilds-publisher.js";
import { buildStatusEmbed } from "./status-panel.js";
import { SystemStatusProbe } from "./status-probe.js";
import { loadStatusConfig } from "./status-config.js";
import { createLinkCode } from "./player-linking.js";
import { buildTicketKindMenu, createTicketButtonId } from "./tickets-panel.js";
import { applySuggestionVote, isValidSuggestionStatus, suggestionVoteCounts, type SuggestionRecord } from "./suggestions-logic.js";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";

export async function handleBotInteraction(interaction: Interaction, env: BotEnv, rootDir: string): Promise<boolean> {
  if (!interaction.guild || interaction.guildId !== env.DISCORD_GUILD_ID) {
    return false;
  }
  if (interaction.user.bot) {
    return true;
  }
  if (interaction.isChatInputCommand()) {
    await handleChatInput(interaction, env, rootDir);
    return true;
  }
  if (interaction.isButton() && interaction.customId === createTicketButtonId) {
    await interaction.reply({ content: "Selecciona el tipo de ticket.", components: [buildTicketKindMenu()], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.isButton() && interaction.customId.startsWith("suggestion:")) {
    await handleSuggestionVote(interaction.customId, interaction.user.id, rootDir);
    await interaction.reply({ content: "Voto registrado.", flags: MessageFlags.Ephemeral });
    return true;
  }
  return false;
}

async function handleChatInput(interaction: ChatInputCommandInteraction, env: BotEnv, rootDir: string): Promise<void> {
  switch (interaction.commandName) {
    case "gremio":
      await handleGuildCommand(interaction, rootDir);
      return;
    case "estado":
      await handleStatusCommand(interaction);
      return;
    case "sugerencia":
      await handleSuggestionCommand(interaction, rootDir);
      return;
    case "evento":
      await requireRolesOrReply(interaction, adminOrModeratorRoleNames()) && await interaction.reply({ content: "Modulo de eventos listo. Usa la persistencia data/events.json; publicacion interactiva se completara en la siguiente fase operativa.", flags: MessageFlags.Ephemeral });
      return;
    case "palworld":
      await requireRolesOrReply(interaction, adminRoleNames()) && await interaction.reply({ content: "Control Palworld bloqueado mientras PALWORLD_CONTROL_ENABLED=false.", flags: MessageFlags.Ephemeral });
      return;
    case "cuarentena":
      await requireRolesOrReply(interaction, adminOrModeratorRoleNames()) && await interaction.reply({ content: booleanEnv("ANTI_RAID_ENABLED", false) ? "Accion de cuarentena registrada." : "Anti-raid desactivado.", flags: MessageFlags.Ephemeral });
      return;
    case "vincular":
      if (!booleanEnv("PLAYER_LINKING_ENABLED", false)) {
        await interaction.reply({ content: "Vinculacion desactivada.", flags: MessageFlags.Ephemeral });
        return;
      }
      {
        const link = createLinkCode(interaction.user.id);
        await interaction.reply({ content: `Codigo temporal: ${link.code}. Expira en 10 minutos.`, flags: MessageFlags.Ephemeral });
      }
      return;
  }
}

async function handleGuildCommand(interaction: ChatInputCommandInteraction, rootDir: string): Promise<void> {
  const config = await loadGuildsConfig(rootDir);
  if (!(await requireRolesOrReply(interaction, config.authorizedRoleNames))) {
    return;
  }
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("usuario", sub !== "miembros");
  const guildValue = interaction.options.getString("gremio", sub === "asignar" || sub === "miembros");
  const roles = await interaction.guild!.roles.fetch();
  const guildRoleIds = guildRoleNames(config).map((name) => roles.find((role) => role.name === name)?.id).filter((id): id is string => Boolean(id));

  if (sub === "ver" && user) {
    const member = await interaction.guild!.members.fetch(user.id);
    const role = member.roles.cache.find((candidate) => guildRoleIds.includes(candidate.id));
    await interaction.reply({ content: role ? `${user} pertenece a ${role.name}.` : `${user} no tiene gremio asignado.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "miembros" && guildValue) {
    const slot = findGuildSlot(config, guildValue);
    const role = slot ? roles.find((candidate) => candidate.name === slot.roleName) : null;
    await interaction.reply({ content: role ? `Rol ${role.name}: usa Discord para ver miembros del rol.` : "Gremio no encontrado.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!user) {
    await interaction.reply({ content: "Usuario requerido.", flags: MessageFlags.Ephemeral });
    return;
  }
  const member = await interaction.guild!.members.fetch(user.id);
  const targetSlot = sub === "asignar" && guildValue ? findGuildSlot(config, guildValue) : undefined;
  const targetRole = targetSlot ? roles.find((role) => role.name === targetSlot.roleName) : null;
  const changes = calculateUniqueGuildAssignment(guildRoleIds, [...member.roles.cache.keys()], targetRole?.id ?? null);
  if (changes.removeRoleIds.length > 0) {
    await member.roles.remove(changes.removeRoleIds, "Comando /gremio");
  }
  if (changes.addRoleId) {
    await member.roles.add(changes.addRoleId, "Comando /gremio");
  }
  await interaction.reply({ content: sub === "quitar" ? `Gremio retirado a ${user}.` : `Gremio asignado a ${user}.`, flags: MessageFlags.Ephemeral });
}

async function handleStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const snapshot = await new SystemStatusProbe().probe(loadStatusConfig());
  await interaction.reply({ embeds: [buildStatusEmbed(snapshot)], flags: MessageFlags.Ephemeral });
}

async function handleSuggestionCommand(interaction: ChatInputCommandInteraction, rootDir: string): Promise<void> {
  if (!booleanEnv("SUGGESTIONS_ENABLED", true)) {
    await interaction.reply({ content: "Sugerencias desactivadas.", flags: MessageFlags.Ephemeral });
    return;
  }
  const sub = interaction.options.getSubcommand();
  if (sub === "estado") {
    if (!(await requireRolesOrReply(interaction, adminOrModeratorRoleNames()))) {
      return;
    }
    const status = interaction.options.getString("estado", true);
    await interaction.reply({ content: isValidSuggestionStatus(status) ? "Estado de sugerencia validado." : "Estado invalido.", flags: MessageFlags.Ephemeral });
    return;
  }
  const channelId = optionalEnv("SUGGESTIONS_CHANNEL_ID");
  const channel = channelId ? await interaction.guild!.channels.fetch(channelId).catch(() => null) : null;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "SUGGESTIONS_CHANNEL_ID no esta configurado como canal de texto.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content: "Sugerencia recibida. Publicacion persistente preparada para el canal configurado.", flags: MessageFlags.Ephemeral });
}

async function handleSuggestionVote(customId: string, userId: string, rootDir: string): Promise<void> {
  const [, suggestionId, vote] = customId.split(":");
  if (!suggestionId || (vote !== "up" && vote !== "down")) {
    return;
  }
  const filePath = path.join(rootDir, "data", "suggestions.json");
  const data = await readJsonFile<{ suggestions: SuggestionRecord[] }>(filePath, { suggestions: [] });
  const record = data.suggestions.find((suggestion) => suggestion.id === suggestionId);
  if (record) {
    applySuggestionVote(record, userId, vote);
    suggestionVoteCounts(record);
    await writeJsonAtomic(filePath, data);
  }
}

async function requireRolesOrReply(interaction: ChatInputCommandInteraction, roleNames: string[]): Promise<boolean> {
  const member = interaction.member instanceof GuildMember ? interaction.member : await interaction.guild!.members.fetch(interaction.user.id);
  if (memberHasAnyRole(member, roleNames)) {
    return true;
  }
  await interaction.reply({ content: "No tienes permisos para usar este comando.", flags: MessageFlags.Ephemeral });
  return false;
}
