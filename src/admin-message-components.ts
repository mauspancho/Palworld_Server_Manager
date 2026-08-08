import {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

export const adminMessageModalId = "admin-message:compose";
export const adminMessageTitleInputId = "title";
export const adminMessageBodyInputId = "body";

export interface AdminAnnouncementInput {
  title: string;
  body: string;
  authorTag?: string;
}

export function buildAdminMessageModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(adminMessageModalId)
    .setTitle("Enviar mensaje a general")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(adminMessageTitleInputId)
          .setLabel("Titulo")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(adminMessageBodyInputId)
          .setLabel("Mensaje")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000)
      )
    );
}

export function isAdminMessageModal(customId: string): boolean {
  return customId === adminMessageModalId;
}

export function buildAdminAnnouncementPayload(input: AdminAnnouncementInput) {
  const title = input.title.trim();
  const body = input.body.trim();
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(body)
    .setColor(0x2f80ed)
    .setTimestamp(new Date());

  if (input.authorTag) {
    embed.setFooter({ text: `Publicado por ${input.authorTag}` });
  }

  return {
    content: "@everyone",
    embeds: [embed],
    allowedMentions: { parse: ["everyone"] as const }
  };
}

export function validateAdminAnnouncementInput(title: string, body: string): string[] {
  const errors: string[] = [];
  if (title.trim().length === 0) {
    errors.push("El titulo no puede estar vacio.");
  }
  if (body.trim().length === 0) {
    errors.push("El mensaje no puede estar vacio.");
  }
  if (title.trim().length > 256) {
    errors.push("El titulo no puede exceder 256 caracteres.");
  }
  if (body.trim().length > 4000) {
    errors.push("El mensaje no puede exceder 4000 caracteres.");
  }
  return errors;
}
