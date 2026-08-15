import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import type { DonationsMessageConfig } from "./donations-panel.js";

export const donationsEditModalId = "donations:edit";
export const donationsTitleInputId = "donations_title";
export const donationsBodyInputId = "donations_body";

export function buildDonationsEditModal(config: DonationsMessageConfig): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(donationsEditModalId)
    .setTitle("Editar mensaje de donaciones")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(donationsTitleInputId)
          .setLabel("Titulo")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256)
          .setValue(config.title)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(donationsBodyInputId)
          .setLabel("Mensaje")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000)
          .setValue(config.body)
      )
    );
}

export function isDonationsEditModal(customId: string): boolean {
  return customId === donationsEditModalId;
}
