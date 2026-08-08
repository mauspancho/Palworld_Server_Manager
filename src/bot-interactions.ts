import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
  MessageFlags
} from "discord.js";
import path from "node:path";
import type { BotEnv } from "./bot-config.js";
import { botEnvSecrets } from "./bot-config.js";
import { loadDesiredStructure } from "./config.js";
import { sanitizeSecret } from "./errors.js";
import { adminOrModeratorRoleNames, adminRoleNames, memberHasAnyRole } from "./command-permissions.js";
import { booleanEnv, optionalEnv } from "./env-utils.js";
import { loadGuildsConfig } from "./guilds-config.js";
import {
  addGuildMember,
  approveGuildRequest,
  calculateUniqueGuildAssignment,
  canManageGuildCommunity,
  createGuildRequest,
  rejectGuildRequest,
  removeGuildMember
} from "./guilds-logic.js";
import { findGuildSlot, guildRoleNames } from "./guilds-publisher.js";
import { ensureGuildCommunityResources } from "./guild-communities-publisher.js";
import {
  findActiveGuildForMember,
  findGuildCommunityById,
  findOwnedActiveGuild,
  pendingGuildRequests,
  readGuildCommunitiesData,
  upsertGuildCommunity,
  writeGuildCommunitiesData
} from "./guilds-state.js";
import type { GuildCommunityRecord } from "./guilds-types.js";
import { buildStatusEmbed } from "./status-panel.js";
import { SystemStatusProbe } from "./status-probe.js";
import { loadStatusConfig } from "./status-config.js";
import { createLinkCode } from "./player-linking.js";
import { buildTicketKindMenu, createTicketButtonId } from "./tickets-panel.js";
import { applySuggestionVote, isValidSuggestionStatus, suggestionVoteCounts, type SuggestionRecord } from "./suggestions-logic.js";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import { formatInformationRepairResult, repairInformationPermissions } from "./info-permissions.js";
import { OperationLogger } from "./logger.js";
import { handleBreedingInteraction } from "./breeding-interactions.js";
import { publishBreedingPanel } from "./breeding-publisher.js";
import { commandAccessLevel, roleNamesForAccess } from "./command-access.js";

export async function handleBotInteraction(interaction: Interaction, env: BotEnv, rootDir: string): Promise<boolean> {
  if (!interaction.guild || interaction.guildId !== env.DISCORD_GUILD_ID) {
    return false;
  }
  if (interaction.user.bot) {
    return true;
  }
  if (await handleBreedingInteraction(interaction, env, rootDir)) {
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
  if (!(await requireCommandAccessOrReply(interaction))) {
    return;
  }
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
    case "informacion":
      await handleInformationCommand(interaction, env, rootDir);
      return;
    case "crianza-panel":
      await handleBreedingPanelCommand(interaction, env, rootDir);
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

async function requireCommandAccessOrReply(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const requiredRoles = roleNamesForAccess(commandAccessLevel(interaction.commandName));
  if (requiredRoles.length === 0) {
    return true;
  }
  return requireRolesOrReply(interaction, requiredRoles);
}

async function handleBreedingPanelCommand(interaction: ChatInputCommandInteraction, env: BotEnv, rootDir: string): Promise<void> {
  if (!(await requireRolesOrReply(interaction, adminOrModeratorRoleNames()))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const botUserId = interaction.client.user?.id;
  if (!botUserId || !interaction.guild) {
    await interaction.editReply("No se pudo identificar el bot o el servidor.");
    return;
  }
  try {
    const botMember = await interaction.guild.members.fetch(botUserId);
    const result = await publishBreedingPanel(rootDir, interaction.guild, botMember, env);
    const logger = new OperationLogger(path.join(rootDir, "logs"), botEnvSecrets(env));
    await logger.log("Panel de crianza publicado desde slash command.", { userId: interaction.user.id, result });
    await interaction.editReply([
      `Panel de crianza ${result.action === "created" ? "publicado" : "actualizado"}.`,
      `Mensaje: ${result.messageId}`,
      `Permisos actualizados: ${result.permissionUpdates}`,
      result.permissionErrors.length > 0 ? `Errores: ${result.permissionErrors.join(" | ")}` : "Errores: ninguno"
    ].join("\n"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await interaction.editReply(`No se pudo reparar/publicar el panel de crianza: ${sanitizeSecret(message, botEnvSecrets(env))}`);
    throw error;
  }
}

async function handleInformationCommand(interaction: ChatInputCommandInteraction, env: BotEnv, rootDir: string): Promise<void> {
  if (!(await requireRolesOrReply(interaction, adminOrModeratorRoleNames()))) {
    return;
  }
  const sub = interaction.options.getSubcommand();
  if (sub !== "reparar") {
    await interaction.reply({ content: "Subcomando no reconocido.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const botUserId = interaction.client.user?.id;
  if (!botUserId || !interaction.guild) {
    await interaction.editReply("No se pudo identificar el bot o el servidor.");
    return;
  }
  try {
    const botMember = await interaction.guild.members.fetch(botUserId);
    const desired = await loadDesiredStructure(path.join(rootDir, "config", "server-structure.yml"));
    const logger = new OperationLogger(path.join(rootDir, "logs"), botEnvSecrets(env));
    const result = await repairInformationPermissions(interaction.guild, botMember, env, desired, {
      rootDir,
      reason: "/informacion reparar",
      log: (message, details) => logger.log(message, details)
    });
    await interaction.editReply(formatInformationRepairResult(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await interaction.editReply(`No se pudo reparar permisos informativos: ${sanitizeSecret(message, botEnvSecrets(env))}`);
    throw error;
  }
}

async function handleGuildCommand(interaction: ChatInputCommandInteraction, rootDir: string): Promise<void> {
  const config = await loadGuildsConfig(rootDir);
  if (!config.enabled) {
    await interaction.reply({ content: "El modulo de gremios esta desactivado.", flags: MessageFlags.Ephemeral });
    return;
  }
  const sub = interaction.options.getSubcommand();
  if (sub === "solicitar") {
    await handleGuildRequestCommand(interaction, rootDir);
    return;
  }
  if (sub === "solicitudes") {
    if (!(await requireRolesOrReply(interaction, config.authorizedRoleNames))) {
      return;
    }
    await handleGuildRequestsListCommand(interaction, rootDir);
    return;
  }
  if (sub === "aprobar") {
    if (!(await requireRolesOrReply(interaction, config.authorizedRoleNames))) {
      return;
    }
    await handleGuildApproveCommand(interaction, rootDir);
    return;
  }
  if (sub === "rechazar") {
    if (!(await requireRolesOrReply(interaction, config.authorizedRoleNames))) {
      return;
    }
    await handleGuildRejectCommand(interaction, rootDir);
    return;
  }
  if (sub === "agregar" || sub === "eliminar") {
    await handleGuildMembershipCommand(interaction, rootDir, sub);
    return;
  }

  if (!(await requireRolesOrReply(interaction, config.authorizedRoleNames))) {
    return;
  }
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

async function handleGuildRequestCommand(interaction: ChatInputCommandInteraction, rootDir: string): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const data = await readGuildCommunitiesData(rootDir);
  const existing = findActiveGuildForMember(data, interaction.guild!.id, interaction.user.id);
  if (existing) {
    await interaction.editReply(`Ya perteneces al gremio "${existing.name}".`);
    return;
  }
  const memberIds = optionalGuildRequestUsers(interaction)
    .filter((user) => !user.bot)
    .map((user) => user.id);
  let request: GuildCommunityRecord;
  try {
    request = createGuildRequest(data, {
      discordGuildId: interaction.guild!.id,
      ownerId: interaction.user.id,
      name: interaction.options.getString("nombre", true),
      memberIds
    });
  } catch (error) {
    await interaction.editReply(error instanceof Error ? error.message : String(error));
    return;
  }
  upsertGuildCommunity(data, request);
  await writeGuildCommunitiesData(rootDir, data);
  await logGuildCommunityEvent(rootDir, interaction, "Solicitud de gremio creada.", { requestId: request.id, name: request.name, ownerId: request.ownerId, memberIds: request.memberIds });
  await interaction.editReply([
    `Solicitud enviada para crear el gremio "${request.name}".`,
    `ID de solicitud: ${request.id}`,
    "Un administrador debe aprobarla antes de crear los canales privados.",
    "",
    "Cuando sea aprobada, tu seras el lider y podras agregar o eliminar integrantes con `/gremio agregar` y `/gremio eliminar`."
  ].join("\n"));
}

async function handleGuildRequestsListCommand(interaction: ChatInputCommandInteraction, rootDir: string): Promise<void> {
  const data = await readGuildCommunitiesData(rootDir);
  const pending = pendingGuildRequests(data, interaction.guild!.id);
  await interaction.reply({
    content: pending.length === 0
      ? "No hay solicitudes pendientes de gremio."
      : pending.map((request) => `${request.id} | ${request.name} | lider: <@${request.ownerId}> | integrantes iniciales: ${request.memberIds.map((id) => `<@${id}>`).join(", ")}`).join("\n"),
    flags: MessageFlags.Ephemeral
  });
}

async function handleGuildApproveCommand(interaction: ChatInputCommandInteraction, rootDir: string): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const config = await loadGuildsConfig(rootDir);
  const data = await readGuildCommunitiesData(rootDir);
  const requestId = interaction.options.getString("solicitud", true);
  const request = findGuildCommunityById(data, requestId);
  if (!request || request.discordGuildId !== interaction.guild!.id || request.status !== "pending") {
    await interaction.editReply("Solicitud pendiente no encontrada.");
    return;
  }
  const botUserId = interaction.client.user?.id;
  if (!botUserId) {
    await interaction.editReply("No se pudo identificar el bot.");
    return;
  }
  const botMember = await interaction.guild!.members.fetch(botUserId);
  const ensured = await ensureGuildCommunityResources(interaction.guild!, botMember, config, request);
  const approved = approveGuildRequest(ensured.record, interaction.user.id);
  for (const memberId of approved.memberIds) {
    const member = await interaction.guild!.members.fetch(memberId).catch(() => null);
    if (member && !member.user.bot && approved.roleId && !member.roles.cache.has(approved.roleId)) {
      await member.roles.add(approved.roleId, "Gremio aprobado");
    }
  }
  upsertGuildCommunity(data, approved);
  await writeGuildCommunitiesData(rootDir, data);
  await logGuildCommunityEvent(rootDir, interaction, "Solicitud de gremio aprobada.", { requestId, name: approved.name, roleId: approved.roleId, textChannelId: approved.textChannelId, voiceChannelId: approved.voiceChannelId });
  await interaction.editReply([
    `Gremio "${approved.name}" aprobado.`,
    `Lider: <@${approved.ownerId}>`,
    approved.textChannelId ? `Canal de texto: <#${approved.textChannelId}>` : "Canal de texto: no disponible",
    approved.voiceChannelId ? `Canal de voz: <#${approved.voiceChannelId}>` : "Canal de voz: no disponible"
  ].join("\n"));
}

async function handleGuildRejectCommand(interaction: ChatInputCommandInteraction, rootDir: string): Promise<void> {
  const data = await readGuildCommunitiesData(rootDir);
  const requestId = interaction.options.getString("solicitud", true);
  const request = findGuildCommunityById(data, requestId);
  if (!request || request.discordGuildId !== interaction.guild!.id || request.status !== "pending") {
    await interaction.reply({ content: "Solicitud pendiente no encontrada.", flags: MessageFlags.Ephemeral });
    return;
  }
  const rejected = rejectGuildRequest(request, interaction.user.id);
  upsertGuildCommunity(data, rejected);
  await writeGuildCommunitiesData(rootDir, data);
  await logGuildCommunityEvent(rootDir, interaction, "Solicitud de gremio rechazada.", { requestId, name: rejected.name, ownerId: rejected.ownerId });
  await interaction.reply({ content: `Solicitud "${rejected.name}" rechazada.`, flags: MessageFlags.Ephemeral });
}

async function handleGuildMembershipCommand(interaction: ChatInputCommandInteraction, rootDir: string, action: "agregar" | "eliminar"): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const config = await loadGuildsConfig(rootDir);
  const data = await readGuildCommunitiesData(rootDir);
  const actor = interaction.member instanceof GuildMember ? interaction.member : await interaction.guild!.members.fetch(interaction.user.id);
  const owned = findOwnedActiveGuild(data, interaction.guild!.id, interaction.user.id);
  const targetUser = interaction.options.getUser("usuario", true);
  const managed = owned ?? (canUseAdminRoles(actor, config.authorizedRoleNames) ? findActiveGuildForMember(data, interaction.guild!.id, targetUser.id) : undefined);
  if (!managed || !canManageGuildCommunity(managed, interaction.user.id, actor.roles.cache.map((role) => role.name), config.authorizedRoleNames)) {
    await interaction.editReply("Solo el lider del gremio o un administrador puede modificar integrantes.");
    return;
  }
  if (targetUser.bot) {
    await interaction.editReply("No se pueden agregar bots a gremios.");
    return;
  }
  const targetMember = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.editReply("Usuario no encontrado en el servidor.");
    return;
  }
  if (!managed.roleId) {
    await interaction.editReply("El gremio no tiene rol configurado. Un administrador debe revisar la aprobacion.");
    return;
  }

  try {
    if (action === "agregar") {
      const otherGuild = findActiveGuildForMember(data, interaction.guild!.id, targetUser.id);
      if (otherGuild && otherGuild.id !== managed.id) {
        await interaction.editReply(`Ese usuario ya pertenece al gremio "${otherGuild.name}".`);
        return;
      }
      const updated = addGuildMember(managed, targetUser.id);
      upsertGuildCommunity(data, updated);
      if (!targetMember.roles.cache.has(managed.roleId)) {
        await targetMember.roles.add(managed.roleId, `Agregado al gremio ${managed.name}`);
      }
      await writeGuildCommunitiesData(rootDir, data);
      await interaction.editReply(`<@${targetUser.id}> agregado al gremio "${managed.name}".`);
      return;
    }

    const updated = removeGuildMember(managed, targetUser.id);
    upsertGuildCommunity(data, updated);
    if (targetMember.roles.cache.has(managed.roleId)) {
      await targetMember.roles.remove(managed.roleId, `Retirado del gremio ${managed.name}`);
    }
    await writeGuildCommunitiesData(rootDir, data);
    await interaction.editReply(`<@${targetUser.id}> retirado del gremio "${managed.name}".`);
  } catch (error) {
    await interaction.editReply(error instanceof Error ? error.message : String(error));
  }
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

function optionalGuildRequestUsers(interaction: ChatInputCommandInteraction) {
  return ["miembro1", "miembro2", "miembro3", "miembro4", "miembro5"]
    .map((name) => interaction.options.getUser(name, false))
    .filter((user): user is NonNullable<typeof user> => Boolean(user));
}

function canUseAdminRoles(member: GuildMember, authorizedRoleNames: string[]): boolean {
  return memberHasAnyRole(member, authorizedRoleNames);
}

async function logGuildCommunityEvent(rootDir: string, interaction: ChatInputCommandInteraction, message: string, details?: unknown): Promise<void> {
  const logger = new OperationLogger(path.join(rootDir, "logs"), botEnvSecrets());
  await logger.log(message, { userId: interaction.user.id, ...objectDetails(details) }).catch(() => undefined);
}

function objectDetails(details: unknown): Record<string, unknown> {
  return details && typeof details === "object" && !Array.isArray(details) ? details as Record<string, unknown> : { details };
}

async function requireRolesOrReply(interaction: ChatInputCommandInteraction, roleNames: string[]): Promise<boolean> {
  const member = interaction.member instanceof GuildMember ? interaction.member : await interaction.guild!.members.fetch(interaction.user.id);
  if (memberHasAnyRole(member, roleNames)) {
    return true;
  }
  await interaction.reply({ content: "No tienes permisos para utilizar este comando.", flags: MessageFlags.Ephemeral });
  return false;
}
