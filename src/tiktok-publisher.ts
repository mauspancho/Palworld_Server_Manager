import {
  ChannelType,
  EmbedBuilder,
  Guild,
  GuildMember,
  MessageCreateOptions,
  PermissionFlagsBits,
  TextChannel
} from "discord.js";
import type { BotEnv } from "./bot-config.js";
import type { TikTokEnv, TikTokMention, TikTokPublishKind, TikTokVideo } from "./tiktok-types.js";

export async function fetchTikTokDestinationChannel(guild: Guild, env: BotEnv): Promise<TextChannel> {
  const channel = await guild.channels.fetch(env.GENERAL_CHAT_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("GENERAL_CHAT_CHANNEL_ID no corresponde a un canal de texto compatible.");
  }
  return channel;
}

export async function validateTikTokDestination(guild: Guild, botMember: GuildMember, env: BotEnv): Promise<string[]> {
  const errors: string[] = [];
  const channel = await guild.channels.fetch(env.GENERAL_CHAT_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    errors.push("GENERAL_CHAT_CHANNEL_ID no corresponde a un canal de texto compatible para TikTok.");
    return errors;
  }
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
    errors.push("El bot no puede enviar mensajes en GENERAL_CHAT_CHANNEL_ID para TikTok.");
  }
  if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
    errors.push("El bot no puede ver GENERAL_CHAT_CHANNEL_ID para TikTok.");
  }
  return errors;
}

export function buildTikTokDiscordPayload(input: {
  displayName: string;
  video: TikTokVideo;
  kind: TikTokPublishKind;
  mention: TikTokMention;
}): MessageCreateOptions {
  const title = input.kind === "test"
    ? "TikTok prueba manual"
    : input.kind === "repost"
      ? "TikTok republicado"
      : "Nuevo video en TikTok";
  const lead = input.kind === "repost"
    ? `${input.displayName} vuelve a compartir uno de sus videos.`
    : `${input.displayName} acaba de publicar un nuevo video.`;
  const description = [input.video.videoDescription, input.video.title].find((value) => value && value.trim()) ?? "Sin descripcion.";
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription([lead, "", description, "", `Ver video:\n${input.video.shareUrl}`].join("\n"))
    .setURL(input.video.shareUrl)
    .setTimestamp(videoDate(input.video));

  if (input.video.coverImageUrl) {
    embed.setThumbnail(input.video.coverImageUrl);
  }

  return {
    content: mentionContent(input.mention),
    allowedMentions: allowedMentionsFor(input.mention),
    embeds: [embed]
  };
}

export async function publishTikTokVideo(
  guild: Guild,
  env: BotEnv,
  tiktokEnv: Pick<TikTokEnv, "mention">,
  input: { displayName: string; video: TikTokVideo; kind: TikTokPublishKind }
): Promise<string> {
  const channel = await fetchTikTokDestinationChannel(guild, env);
  const message = await channel.send(buildTikTokDiscordPayload({
    ...input,
    mention: tiktokEnv.mention
  }));
  return message.id;
}

function mentionContent(mention: TikTokMention): string | undefined {
  if (mention === "everyone") {
    return "@everyone";
  }
  if (mention === "here") {
    return "@here";
  }
  return undefined;
}

function allowedMentionsFor(mention: TikTokMention): MessageCreateOptions["allowedMentions"] {
  if (mention === "everyone") {
    return { parse: ["everyone"] };
  }
  if (mention === "here") {
    return { parse: ["everyone"] };
  }
  return { parse: [] };
}

function videoDate(video: TikTokVideo): Date {
  return video.createTime ? new Date(video.createTime * 1000) : new Date();
}
