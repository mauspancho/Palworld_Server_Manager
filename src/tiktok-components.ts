import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

export const tiktokPendingConfirmPrefix = "tiktok:pending:confirm:";
export const tiktokPendingCancelPrefix = "tiktok:pending:cancel:";
export const tiktokDisconnectConfirmPrefix = "tiktok:disconnect:confirm:";
export const tiktokDisconnectCancelPrefix = "tiktok:disconnect:cancel:";

export function isTikTokPendingDmButton(customId: string): boolean {
  return customId.startsWith(tiktokPendingConfirmPrefix) || customId.startsWith(tiktokPendingCancelPrefix);
}

export function isTikTokDisconnectButton(customId: string): boolean {
  return customId.startsWith(tiktokDisconnectConfirmPrefix) || customId.startsWith(tiktokDisconnectCancelPrefix);
}

export function tiktokIdFromCustomId(customId: string): string {
  return customId.split(":").at(-1) ?? "";
}

export function buildTikTokPendingConfirmationPayload(input: { state: string; displayName: string }) {
  return {
    content: [
      "Cuenta TikTok detectada:",
      input.displayName,
      "",
      "Confirma si esta es la cuenta correcta."
    ].join("\n"),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${tiktokPendingConfirmPrefix}${input.state}`)
          .setLabel("Confirmar cuenta")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${tiktokPendingCancelPrefix}${input.state}`)
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

export function buildTikTokDisconnectConfirmationPayload(sessionId: string) {
  return {
    content: [
      "Vas a desconectar la cuenta TikTok de este servidor.",
      "TikTok revocara la autorizacion de esta aplicacion cuando sea posible.",
      "",
      "Confirma la accion."
    ].join("\n"),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${tiktokDisconnectConfirmPrefix}${sessionId}`)
          .setLabel("Desconectar")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${tiktokDisconnectCancelPrefix}${sessionId}`)
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}
