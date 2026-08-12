import { EmbedBuilder, type GuildMember } from "discord.js";

export interface WelcomeMessageInput {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: Date;
  memberCount: number;
  rulesChannelId: string;
  rolesChannelId: string;
  generalChatChannelId?: string;
  donationsChannelId?: string;
}

export function buildWelcomeEmbed(input: WelcomeMessageInput): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Bienvenido a XBOXPALSERVER")
    .setDescription(
      [
        `Hola <@${input.memberId}>, bienvenido a nuestra comunidad de Palworld.`,
        "",
        "Antes de comenzar:",
        `1. Lee las reglas en el canal <#${input.rulesChannelId}>.`,
        "2. Acepta las reglas usando los botones del mensaje de reglas.",
        `3. Selecciona tus roles en <#${input.rolesChannelId}>.`,
        "4. Consulta los datos del servidor.",
        `5. Cuando aceptes, continua en ${input.generalChatChannelId ? `<#${input.generalChatChannelId}>` : "el chat general"}.`,
        input.donationsChannelId ? `6. Si deseas apoyar el servidor: <#${input.donationsChannelId}>.` : undefined
      ].filter((line): line is string => line !== undefined).join("\n")
    )
    .addFields(
      { name: "Fecha de entrada", value: formatDiscordTimestamp(input.joinedAt), inline: true },
      { name: "Miembros actuales", value: String(input.memberCount), inline: true }
    )
    .setTimestamp(input.joinedAt);

  if (input.avatarUrl) {
    embed.setThumbnail(input.avatarUrl);
  }

  return embed;
}

export function buildWelcomeMessageInput(
  member: GuildMember,
  rulesChannelId: string,
  rolesChannelId: string,
  generalChatChannelId?: string,
  donationsChannelId?: string
): WelcomeMessageInput {
  return {
    memberId: member.id,
    displayName: member.displayName,
    avatarUrl: member.user.displayAvatarURL({ size: 256 }),
    joinedAt: member.joinedAt ?? new Date(),
    memberCount: member.guild.memberCount,
    rulesChannelId,
    rolesChannelId,
    generalChatChannelId,
    donationsChannelId
  };
}

export function buildDirectWelcomeMessage(rulesChannelId: string, rolesChannelId: string, generalChatChannelId?: string): string {
  return [
    "Bienvenido a XBOXPALSERVER.",
    "",
    `Reglas: <#${rulesChannelId}>`,
    `Seleccion de roles: <#${rolesChannelId}>`,
    generalChatChannelId ? `Chat general despues de aceptar: <#${generalChatChannelId}>` : "",
    "",
    "Para acceder al resto del servidor debes leer y aceptar las reglas usando los botones del mensaje de reglas."
  ].join("\n");
}

function formatDiscordTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}
