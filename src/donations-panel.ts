import { EmbedBuilder } from "discord.js";

export const donationsChannelName = "💖・apoya-el-servidor";
export const donationsMessageStateFile = "donations-message.json";
export const donationsPaypalUrl = "https://paypal.me/xboxpalserver";

export interface DonationsMessageConfig {
  title: string;
  body: string;
}

export const defaultDonationsMessageConfig: DonationsMessageConfig = {
  title: "💖・apoya-el-servidor",
  body: [
    "Si disfrutas del servidor y deseas ayudarnos a mantenerlo activo, puedes realizar un aporte voluntario.",
    "",
    "Las aportaciones ayudan con los gastos de hosting, mantenimiento y mejoras del servidor.",
    "",
    "❤️ Gracias por apoyar a la comunidad."
  ].join("\n")
};

export function buildDonationsMessagePayload(config: DonationsMessageConfig = defaultDonationsMessageConfig) {
  const title = config.title.trim();
  const body = withoutPaypalUrl(config.body.trim());
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription([
          body,
          "",
          `💳 **PayPal:** ${donationsPaypalUrl}`
        ].join("\n"))
        .setColor(0xe85d9e)
    ]
  };
}

export function validateDonationsMessageConfig(title: string, body: string): string[] {
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

export function normalizeDonationsMessageConfig(title: string, body: string): DonationsMessageConfig {
  return {
    title: title.trim(),
    body: withoutPaypalUrl(body.trim()).trim()
  };
}

function withoutPaypalUrl(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !line.includes(donationsPaypalUrl))
    .join("\n")
    .trim();
}
