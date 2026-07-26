import {
  ButtonInteraction,
  ChannelType,
  Guild,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel
} from "discord.js";
import type { BotEnv } from "./bot-config.js";
import {
  buildGeneralChatLinkRow,
  buildRulesAcceptedEmbed,
  buildRulesActionRow,
  buildRulesPromptEmbed,
  rulesAcceptButtonId,
  rulesRejectButtonId
} from "./rules-acceptance-components.js";
import { canProcessRulesPrompt, calculateRejectCount, shouldShowAlreadyAccepted } from "./rules-acceptance-logic.js";
import {
  findLatestPendingPromptForUser,
  findPromptByMessage,
  readRulesAcceptanceData,
  upsertRulesPrompt,
  writeRulesAcceptanceData
} from "./rules-acceptance-state.js";
import type { RulesAcceptanceResult, RulesPromptRecord } from "./rules-acceptance-types.js";
import { sanitizeSecret } from "./errors.js";
import { botEnvSecrets } from "./bot-config.js";

export function isRulesButton(customId: string): boolean {
  return customId === rulesAcceptButtonId || customId === rulesRejectButtonId;
}

export async function publishRulesPromptForMember(member: GuildMember, env: BotEnv, rootDir: string): Promise<void> {
  if (member.roles.cache.has(env.MEMBER_ROLE_ID)) {
    return;
  }

  const data = await readRulesAcceptanceData(rootDir);
  if (findLatestPendingPromptForUser(data, member.guild.id, member.id)) {
    return;
  }

  const rulesChannel = await fetchTextChannel(member.guild, env.RULES_CHANNEL_ID, "RULES_CHANNEL_ID");
  const message = await rulesChannel.send({
    content: `<@${member.id}>`,
    embeds: [buildRulesPromptEmbed(member.id)],
    components: [buildRulesActionRow(false)]
  });

  upsertRulesPrompt(data, {
    guildId: member.guild.id,
    userId: member.id,
    channelId: rulesChannel.id,
    messageId: message.id,
    status: "pending",
    rejectCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await writeRulesAcceptanceData(rootDir, data);
}

export async function handleRulesButtonInteraction(interaction: ButtonInteraction, env: BotEnv, rootDir: string): Promise<void> {
  if (!isRulesButton(interaction.customId)) {
    return;
  }
  if (!interaction.guild || interaction.guildId !== env.DISCORD_GUILD_ID) {
    return;
  }
  if (interaction.user.bot) {
    return;
  }

  const data = await readRulesAcceptanceData(rootDir);
  const prompt = findPromptByMessage(data, interaction.message.id);
  if (!canProcessRulesPrompt(prompt?.userId, interaction.user.id)) {
    await interaction.reply({ content: "Esta solicitud de reglas no corresponde a tu usuario.", flags: MessageFlags.Ephemeral });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "Ya no perteneces al servidor.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (shouldShowAlreadyAccepted(member.roles.cache.has(env.MEMBER_ROLE_ID))) {
    await interaction.reply({
      content: `Ya aceptaste las reglas y tienes acceso al servidor.\n\nIr al chat general: <#${env.GENERAL_CHAT_CHANNEL_ID}>`,
      components: [buildGeneralChatLinkRow(interaction.guild.id, env.GENERAL_CHAT_CHANNEL_ID)],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.customId === rulesAcceptButtonId) {
    await acceptRules(interaction, member, env, rootDir, data, prompt);
    return;
  }

  await rejectRules(interaction, member, env, rootDir, data, prompt);
}

async function acceptRules(
  interaction: ButtonInteraction,
  member: GuildMember,
  env: BotEnv,
  rootDir: string,
  data: Awaited<ReturnType<typeof readRulesAcceptanceData>>,
  prompt: RulesPromptRecord | undefined
): Promise<void> {
  const validationError = await validateAcceptancePrerequisites(interaction.guild!, member, env);
  if (validationError) {
    await logRulesEvent(interaction.guild!, env, {
      userId: member.id,
      action: "Error al aceptar reglas",
      details: validationError
    });
    await interaction.reply({
      content: "No fue posible completar la asignacion de acceso. Un administrador debe revisar los permisos del bot.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  let result: RulesAcceptanceResult;
  try {
    result = await assignAcceptedAccess(member, env);
  } catch (error) {
    await logRulesEvent(interaction.guild!, env, {
      userId: member.id,
      action: "Error al aceptar reglas",
      details: `Asignacion de roles fallida: ${sanitizeSecret(error, botEnvSecrets(env))}`
    });
    await interaction.reply({
      content: "No fue posible completar la asignacion de acceso. Un administrador debe revisar los permisos del bot.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  const updatedPrompt = {
    ...prompt!,
    status: "accepted" as const,
    acceptedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  upsertRulesPrompt(data, updatedPrompt);
  await writeRulesAcceptanceData(rootDir, data);

  await interaction.update({
    embeds: [buildRulesAcceptedEmbed(member.id, env.GENERAL_CHAT_CHANNEL_ID)],
    components: [buildRulesActionRow(true), buildGeneralChatLinkRow(interaction.guild!.id, env.GENERAL_CHAT_CHANNEL_ID)]
  });

  await interaction.followUp({
    content: [
      "Has aceptado correctamente las reglas del servidor.",
      "",
      "Ya tienes acceso a los canales de la comunidad. Puedes continuar en el chat general.",
      "",
      `Ir al chat general: <#${env.GENERAL_CHAT_CHANNEL_ID}>`
    ].join("\n"),
    components: [buildGeneralChatLinkRow(interaction.guild!.id, env.GENERAL_CHAT_CHANNEL_ID)],
    flags: MessageFlags.Ephemeral
  });

  await logRulesEvent(interaction.guild!, env, {
    userId: member.id,
    action: "Reglas aceptadas",
    details: `Rol asignado: ${env.MEMBER_ROLE_ID}. Rol pendiente retirado: ${String(result.removedPendingRole)}.`
  });
}

async function rejectRules(
  interaction: ButtonInteraction,
  member: GuildMember,
  env: BotEnv,
  rootDir: string,
  data: Awaited<ReturnType<typeof readRulesAcceptanceData>>,
  prompt: RulesPromptRecord | undefined
): Promise<void> {
  const rejectCount = calculateRejectCount(prompt?.rejectCount ?? 0);
  const updatedPrompt = {
    ...prompt!,
    rejectCount,
    updatedAt: new Date().toISOString()
  };
  upsertRulesPrompt(data, updatedPrompt);
  await writeRulesAcceptanceData(rootDir, data);

  await interaction.update({
    embeds: [buildRulesPromptEmbed(member.id, rejectCount)],
    components: [buildRulesActionRow(false)]
  });

  await interaction.followUp({
    content: rejectCount === 1
      ? [
          "Has indicado que no aceptas las reglas del servidor.",
          "",
          "Para permanecer en esta comunidad es obligatorio aceptar las reglas. Si decides no aceptarlas, podras ser expulsado del servidor.",
          "",
          "Revisa nuevamente las reglas y selecciona una opcion."
        ].join("\n")
      : [
          "Las reglas son obligatorias para permanecer en el servidor.",
          "",
          "Mientras no las aceptes, no tendras acceso a los canales generales y un administrador podra expulsarte del servidor."
        ].join("\n"),
    flags: MessageFlags.Ephemeral
  });

  await logRulesEvent(interaction.guild!, env, {
    userId: member.id,
    action: "Reglas rechazadas",
    details: `Cantidad de rechazos durante la sesion: ${rejectCount}.`
  });
}

async function assignAcceptedAccess(member: GuildMember, env: BotEnv): Promise<RulesAcceptanceResult> {
  let addedMemberRole = false;
  let removedPendingRole = false;
  if (!member.roles.cache.has(env.MEMBER_ROLE_ID)) {
    await member.roles.add(env.MEMBER_ROLE_ID, "Reglas aceptadas");
    addedMemberRole = true;
  }
  if (env.PENDING_MEMBER_ROLE_ID && member.roles.cache.has(env.PENDING_MEMBER_ROLE_ID)) {
    await member.roles.remove(env.PENDING_MEMBER_ROLE_ID, "Reglas aceptadas");
    removedPendingRole = true;
  }
  return { addedMemberRole, removedPendingRole };
}

export async function assignPendingRoleIfConfigured(member: GuildMember, env: BotEnv): Promise<boolean> {
  if (!env.PENDING_MEMBER_ROLE_ID || member.roles.cache.has(env.MEMBER_ROLE_ID) || member.roles.cache.has(env.PENDING_MEMBER_ROLE_ID)) {
    return false;
  }
  await member.roles.add(env.PENDING_MEMBER_ROLE_ID, "Pendiente de aceptar reglas");
  return true;
}

async function validateAcceptancePrerequisites(guild: Guild, member: GuildMember, env: BotEnv): Promise<string | null> {
  const botId = guild.client.user?.id;
  if (!botId) {
    return "No se pudo identificar al bot.";
  }
  const botMember = await guild.members.fetch(botId).catch(() => null);
  if (!botMember) {
    return "No se pudo obtener el miembro del bot.";
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "El bot no tiene ManageRoles.";
  }

  const memberRole = await guild.roles.fetch(env.MEMBER_ROLE_ID).catch(() => null);
  if (!memberRole) {
    return "MEMBER_ROLE_ID no existe.";
  }
  if (memberRole.managed) {
    return "MEMBER_ROLE_ID es administrado por integracion.";
  }
  if (botMember.roles.highest.comparePositionTo(memberRole) <= 0) {
    return "El rol del bot no esta por encima de MEMBER_ROLE_ID.";
  }

  if (env.PENDING_MEMBER_ROLE_ID) {
    const pendingRole = await guild.roles.fetch(env.PENDING_MEMBER_ROLE_ID).catch(() => null);
    if (pendingRole && botMember.roles.highest.comparePositionTo(pendingRole) <= 0) {
      return "El rol del bot no esta por encima de PENDING_MEMBER_ROLE_ID.";
    }
  }

  const generalChannel = await guild.channels.fetch(env.GENERAL_CHAT_CHANNEL_ID).catch(() => null);
  if (!generalChannel || generalChannel.type !== ChannelType.GuildText) {
    return "GENERAL_CHAT_CHANNEL_ID no existe o no es canal de texto.";
  }
  return null;
}

async function fetchTextChannel(guild: Guild, channelId: string, label: string): Promise<TextChannel> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(`${label} no existe o no es canal de texto.`);
  }
  return channel;
}

async function logRulesEvent(guild: Guild, env: BotEnv, input: { userId: string; action: string; details: string }): Promise<void> {
  const channel = await fetchTextChannel(guild, env.MEMBER_LOG_CHANNEL_ID, "MEMBER_LOG_CHANNEL_ID").catch(() => null);
  const content = [
    `Usuario: <@${input.userId}>`,
    `ID del usuario: ${input.userId}`,
    `Accion: ${input.action}`,
    `Servidor: ${guild.name} (${guild.id})`,
    `Detalle: ${sanitizeSecret(input.details, botEnvSecrets(env))}`,
    `Fecha y hora: ${new Date().toISOString()}`
  ].join("\n");
  await channel?.send({ content }).catch(() => undefined);
}
