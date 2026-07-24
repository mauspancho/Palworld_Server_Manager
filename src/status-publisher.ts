import { ChannelType, Guild, TextChannel } from "discord.js";
import { SafeError } from "./errors.js";
import { buildStatusEmbed } from "./status-panel.js";
import { SystemStatusProbe, shouldSendStatusAlert, type StatusProbe } from "./status-probe.js";
import { readStatusState, writeStatusState } from "./status-state.js";
import type { PalworldStatusConfig } from "./status-types.js";

export async function publishStatusPanel(rootDir: string, guild: Guild, config: PalworldStatusConfig, probe: StatusProbe = new SystemStatusProbe()): Promise<void> {
  if (!config.enabled) {
    throw new SafeError("PALWORLD_STATUS_ENABLED esta desactivado.");
  }
  if (!config.statusChannelId) {
    throw new SafeError("PALWORLD_STATUS_CHANNEL_ID no esta configurado.");
  }
  const channel = await fetchTextChannel(guild, config.statusChannelId, "PALWORLD_STATUS_CHANNEL_ID");
  const snapshot = await probe.probe(config);
  const previous = await readStatusState(rootDir);
  const payload = { embeds: [buildStatusEmbed(snapshot)] };
  const existing = previous?.channelId === channel.id ? await channel.messages.fetch(previous.messageId).catch(() => null) : null;
  const message = existing ? await existing.edit(payload) : await channel.send(payload);
  await writeStatusState(rootDir, { guildId: guild.id, channelId: channel.id, messageId: message.id, lastStatus: snapshot.status, updatedAt: new Date().toISOString() });

  if (config.alertChannelId && shouldSendStatusAlert(previous?.lastStatus, snapshot.status)) {
    const alertChannel = await fetchTextChannel(guild, config.alertChannelId, "PALWORLD_ALERT_CHANNEL_ID").catch(() => null);
    await alertChannel?.send(`Cambio de estado Palworld: ${previous?.lastStatus ?? "desconocido"} -> ${snapshot.status}`);
  }
}

async function fetchTextChannel(guild: Guild, channelId: string, label: string): Promise<TextChannel> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new SafeError(`${label} debe ser un canal de texto existente.`);
  }
  return channel;
}
