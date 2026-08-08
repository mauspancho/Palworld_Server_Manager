import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import type { GuildCommunityRecord } from "./guilds-types.js";

export const guildRequestCustomIdPrefix = "guild-request:";
export const guildRequestApprovePrefix = `${guildRequestCustomIdPrefix}approve:`;
export const guildRequestRejectPrefix = `${guildRequestCustomIdPrefix}reject:`;
export const guildRequestCancelPrefix = `${guildRequestCustomIdPrefix}cancel:`;
export const guildRequestRejectModalPrefix = `${guildRequestCustomIdPrefix}reject-modal:`;
export const guildRequestRejectReasonInputId = "reason";

export function isGuildRequestComponent(customId: string): boolean {
  return customId.startsWith(guildRequestCustomIdPrefix);
}

export function buildGuildRequestReviewPayload(record: GuildCommunityRecord) {
  return {
    embeds: [buildGuildRequestEmbed(record)],
    components: record.status === "pending" ? [buildGuildRequestActionRow(record.id)] : []
  };
}

export function buildGuildRequestEmbed(record: GuildCommunityRecord): EmbedBuilder {
  const statusLabel = guildRequestStatusLabel(record);
  const fields = [
    { name: "Solicitud", value: record.id, inline: false },
    { name: "Gremio", value: record.name, inline: true },
    { name: "Estado", value: statusLabel, inline: true },
    { name: "Solicitante / lider", value: `<@${record.ownerId}>`, inline: false },
    { name: "Integrantes iniciales", value: record.memberIds.map((id) => `<@${id}>`).join(", ") || "Solo el solicitante.", inline: false }
  ];
  if (record.rejectionReason) {
    fields.push({ name: "Motivo de rechazo", value: record.rejectionReason.slice(0, 1024), inline: false });
  }
  return new EmbedBuilder()
    .setTitle("Solicitud de creacion de gremio")
    .setDescription("Revisa la solicitud y selecciona una accion administrativa.")
    .addFields(fields)
    .setColor(record.status === "pending" ? 0xf2c94c : record.status === "active" ? 0x57f287 : 0xed4245)
    .setTimestamp(new Date(record.updatedAt));
}

export function buildGuildRequestActionRow(requestId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${guildRequestApprovePrefix}${requestId}`)
      .setLabel("Aceptar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${guildRequestRejectPrefix}${requestId}`)
      .setLabel("Rechazar")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${guildRequestCancelPrefix}${requestId}`)
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary)
  );
}

export function buildGuildRejectModal(record: GuildCommunityRecord): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${guildRequestRejectModalPrefix}${record.id}`)
    .setTitle("Rechazar solicitud de gremio")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(guildRequestRejectReasonInputId)
          .setLabel("Motivo para el solicitante")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(500)
      )
    );
}

export function guildRequestIdFromCustomId(customId: string, prefix: string): string {
  return customId.slice(prefix.length);
}

function guildRequestStatusLabel(record: GuildCommunityRecord): string {
  if (record.status === "active") {
    return "Aprobada";
  }
  if (record.status === "rejected") {
    return "Rechazada";
  }
  if (record.status === "cancelled") {
    return "Cancelada";
  }
  return "Pendiente";
}
