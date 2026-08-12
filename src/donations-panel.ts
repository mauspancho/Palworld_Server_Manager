import { EmbedBuilder } from "discord.js";

export const donationsChannelName = "💖・apoya-el-servidor";
export const donationsMessageStateFile = "donations-message.json";
export const donationsPaypalUrl = "https://paypal.me/xboxpalserver";

export function buildDonationsMessagePayload() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("💖・apoya-el-servidor")
        .setDescription([
          "Si disfrutas del servidor y deseas ayudarnos a mantenerlo activo, puedes realizar un aporte voluntario.",
          "",
          "Las aportaciones ayudan con los gastos de hosting, mantenimiento y mejoras del servidor.",
          "",
          `💳 **PayPal:** ${donationsPaypalUrl}`,
          "",
          "❤️ Gracias por apoyar a la comunidad."
        ].join("\n"))
        .setColor(0xe85d9e)
    ]
  };
}
