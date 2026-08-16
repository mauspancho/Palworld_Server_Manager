import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from "discord.js";
import type { TikTokRepublishSession } from "./tiktok-republish-state.js";
import { currentTikTokRepublishPage } from "./tiktok-republish-state.js";
import { maskIdentifier } from "./tiktok-crypto.js";
import type { TikTokVideo } from "./tiktok-types.js";

export const tiktokRepublishSelectPrefix = "tiktok:repub:select:";
export const tiktokRepublishPrevPrefix = "tiktok:repub:prev:";
export const tiktokRepublishNextPrefix = "tiktok:repub:next:";

export function isTikTokRepublishComponent(customId: string): boolean {
  return customId.startsWith(tiktokRepublishSelectPrefix)
    || customId.startsWith(tiktokRepublishPrevPrefix)
    || customId.startsWith(tiktokRepublishNextPrefix);
}

export function tiktokRepublishSessionId(customId: string): string {
  return customId.split(":").at(-1) ?? "";
}

export function buildTikTokRepublishMessage(session: TikTokRepublishSession) {
  const page = currentTikTokRepublishPage(session);
  const pageNumber = session.currentPageIndex + 1;
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${tiktokRepublishSelectPrefix}${session.sessionId}`)
    .setPlaceholder("Selecciona un video")
    .setMinValues(1)
    .setMaxValues(1)
    .setOptions(page.videos.slice(0, 20).map(videoToOption));
  const prev = new ButtonBuilder()
    .setCustomId(`${tiktokRepublishPrevPrefix}${session.sessionId}`)
    .setLabel("Anterior")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(session.currentPageIndex === 0);
  const next = new ButtonBuilder()
    .setCustomId(`${tiktokRepublishNextPrefix}${session.sessionId}`)
    .setLabel("Siguiente")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!page.hasMore && session.currentPageIndex >= session.pages.length - 1);

  return {
    content: `Selecciona el video que deseas republicar de ${session.displayName}.\nPagina ${pageNumber}.`,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next)
    ]
  };
}

function videoToOption(video: TikTokVideo) {
  const labelBase = video.title || video.videoDescription || "Video sin titulo";
  const date = video.createTime ? new Date(video.createTime * 1000).toISOString().slice(0, 10) : "sin fecha";
  return {
    label: truncate(labelBase, 80),
    description: truncate(`${date} | ${maskIdentifier(video.id)}`, 100),
    value: video.id
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
