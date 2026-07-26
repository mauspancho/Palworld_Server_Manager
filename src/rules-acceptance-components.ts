import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";

export const rulesAcceptButtonId = "rules_accept";
export const rulesRejectButtonId = "rules_reject";

export function buildRulesPromptEmbed(userId: string, rejectCount = 0): EmbedBuilder {
  const description = rejectCount === 0
    ? [
        `Hola <@${userId}>.`,
        "",
        "Para acceder al resto del servidor debes confirmar que leiste y aceptas estas reglas.",
        "",
        "Selecciona una opcion:"
      ].join("\n")
    : [
        rejectCount === 1
          ? "Has indicado que no aceptas las reglas del servidor."
          : "Las reglas son obligatorias para permanecer en el servidor.",
        "",
        rejectCount === 1
          ? "Para permanecer en esta comunidad es obligatorio aceptar las reglas. Si decides no aceptarlas, podras ser expulsado del servidor."
          : "Mientras no las aceptes, no tendras acceso a los canales generales y un administrador podra expulsarte del servidor.",
        "",
        "Revisa nuevamente las reglas y selecciona una opcion."
      ].join("\n");

  return new EmbedBuilder()
    .setTitle(rejectCount === 0 ? "Aceptacion de reglas" : "Reglas no aceptadas")
    .setDescription(description)
    .setTimestamp(new Date());
}

export function buildRulesAcceptedEmbed(userId: string, generalChatChannelId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Reglas aceptadas")
    .setDescription([
      `<@${userId}> acepto correctamente las reglas del servidor.`,
      "",
      `Ir al chat general: <#${generalChatChannelId}>`
    ].join("\n"))
    .setTimestamp(new Date());
}

export function buildRulesActionRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(rulesAcceptButtonId)
      .setLabel("Aceptar reglas")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(rulesRejectButtonId)
      .setLabel("Rechazar reglas")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

export function buildGeneralChatLinkRow(guildId: string, generalChatChannelId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Ir al chat general")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guildId}/${generalChatChannelId}`)
  );
}
