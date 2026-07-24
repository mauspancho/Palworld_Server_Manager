import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";

export const createTicketButtonId = "ticket:create";
export const ticketKindSelectId = "ticket:kind";
export const claimTicketButtonId = "ticket:claim";
export const closeTicketButtonId = "ticket:close";
export const reopenTicketButtonId = "ticket:reopen";

export function buildTicketPanelPayload() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("Soporte")
        .setDescription("Abre un ticket privado para recibir ayuda del equipo.")
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(createTicketButtonId).setLabel("Crear ticket").setStyle(ButtonStyle.Primary)
      )
    ]
  };
}

export function buildTicketKindMenu() {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ticketKindSelectId)
      .setPlaceholder("Selecciona el tipo de ticket")
      .setMinValues(1)
      .setMaxValues(1)
      .setOptions(
        { label: "Problema tecnico", value: "technical" },
        { label: "Reportar jugador", value: "player-report" },
        { label: "Apelacion", value: "appeal" },
        { label: "Problema con la partida", value: "gameplay" },
        { label: "Consulta administrativa", value: "admin" }
      )
  );
}

export function buildTicketActionRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(claimTicketButtonId).setLabel("Tomar ticket").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(closeTicketButtonId).setLabel("Cerrar ticket").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(reopenTicketButtonId).setLabel("Reabrir ticket").setStyle(ButtonStyle.Success)
  );
}
