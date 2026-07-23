import {
  ChannelType,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  TextChannel
} from "discord.js";
import type { BotEnv } from "./bot-config.js";

export interface BotValidationResult {
  errors: string[];
  warnings: string[];
}

export async function validateBotConfiguration(guild: Guild, botMember: GuildMember, env: BotEnv): Promise<BotValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const welcomeChannel = await validateTextChannel(guild, env.WELCOME_CHANNEL_ID, "WELCOME_CHANNEL_ID", errors);
  await validateTextChannel(guild, env.RULES_CHANNEL_ID, "RULES_CHANNEL_ID", errors);
  await validateTextChannel(guild, env.ROLES_CHANNEL_ID, "ROLES_CHANNEL_ID", errors);
  const logChannel = await validateTextChannel(guild, env.MEMBER_LOG_CHANNEL_ID, "MEMBER_LOG_CHANNEL_ID", errors);

  const memberRole = await guild.roles.fetch(env.MEMBER_ROLE_ID).catch(() => null);
  if (!memberRole) {
    errors.push("MEMBER_ROLE_ID no corresponde a un rol existente.");
  } else if (memberRole.managed) {
    errors.push("MEMBER_ROLE_ID apunta a un rol administrado por integracion y no puede asignarse manualmente.");
  } else if (botMember.roles.highest.comparePositionTo(memberRole) <= 0) {
    errors.push("El rol mas alto del bot debe estar por encima de MEMBER_ROLE_ID.");
  }

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    errors.push("El bot necesita permiso ManageRoles para asignar MEMBER_ROLE_ID.");
  }

  for (const [label, channel] of [
    ["WELCOME_CHANNEL_ID", welcomeChannel],
    ["MEMBER_LOG_CHANNEL_ID", logChannel]
  ] as const) {
    if (channel && !channel.permissionsFor(botMember).has(PermissionFlagsBits.SendMessages)) {
      errors.push(`El bot no puede enviar mensajes en ${label}.`);
    }
  }

  return { errors, warnings };
}

async function validateTextChannel(
  guild: Guild,
  channelId: string,
  label: string,
  errors: string[]
): Promise<TextChannel | null> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    errors.push(`${label} no corresponde a un canal existente.`);
    return null;
  }

  if (channel.type !== ChannelType.GuildText) {
    errors.push(`${label} debe ser un canal de texto.`);
    return null;
  }

  return channel;
}

export function formatValidationResult(result: BotValidationResult): string {
  const lines: string[] = [];
  for (const warning of result.warnings) {
    lines.push(`Advertencia: ${warning}`);
  }
  for (const error of result.errors) {
    lines.push(`Error: ${error}`);
  }
  if (lines.length === 0) {
    lines.push("Configuracion del bot valida.");
  }
  return lines.join("\n");
}
