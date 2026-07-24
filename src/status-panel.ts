import { EmbedBuilder } from "discord.js";
import type { PalworldStatusSnapshot } from "./status-types.js";

export function buildStatusEmbed(snapshot: PalworldStatusSnapshot): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Estado del servidor Palworld")
    .addFields(
      { name: "Estado", value: statusLabel(snapshot.status), inline: true },
      { name: "Servicio", value: snapshot.serviceName, inline: true },
      { name: "Puerto", value: String(snapshot.port), inline: true },
      { name: "Tiempo activo", value: snapshot.uptime || "desconocido", inline: false },
      { name: "Memoria", value: snapshot.memory, inline: true },
      { name: "PID principal", value: snapshot.mainPid, inline: true },
      { name: "Jugadores", value: snapshot.players, inline: true },
      { name: "Ultima revision", value: `<t:${Math.floor(new Date(snapshot.checkedAt).getTime() / 1000)}:F>`, inline: false }
    )
    .setTimestamp(new Date(snapshot.checkedAt));
}

export function statusLabel(status: PalworldStatusSnapshot["status"]): string {
  switch (status) {
    case "online":
      return "🟢 En linea";
    case "offline":
      return "🔴 Fuera de linea";
    case "starting":
      return "🟡 Iniciando";
    case "failed":
      return "🔴 Failed";
    default:
      return "⚪ Desconocido";
  }
}
