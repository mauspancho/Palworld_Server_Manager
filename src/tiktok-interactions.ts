import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
  MessageFlags,
  StringSelectMenuInteraction
} from "discord.js";
import path from "node:path";
import type { BotEnv } from "./bot-config.js";
import { adminRoleNames, memberHasAnyRole } from "./command-permissions.js";
import { OperationLogger } from "./logger.js";
import { loadTikTokEnv } from "./tiktok-config.js";
import {
  buildTikTokDisconnectConfirmationPayload,
  isTikTokDisconnectButton,
  isTikTokPendingDmButton,
  tiktokDisconnectCancelPrefix,
  tiktokDisconnectConfirmPrefix,
  tiktokIdFromCustomId
} from "./tiktok-components.js";
import { TikTokApiClient } from "./tiktok-api-client.js";
import { maskIdentifier, randomTikTokId } from "./tiktok-crypto.js";
import {
  buildTikTokRepublishMessage,
  isTikTokRepublishComponent,
  tiktokRepublishNextPrefix,
  tiktokRepublishPrevPrefix,
  tiktokRepublishSelectPrefix,
  tiktokRepublishSessionId
} from "./tiktok-republish-ui.js";
import {
  createTikTokRepublishSession,
  currentTikTokRepublishPage,
  getTikTokRepublishSession,
  moveTikTokRepublishPage,
  saveTikTokRepublishPage
} from "./tiktok-republish-state.js";
import {
  cancelTikTokPendingConnection,
  confirmTikTokPendingConnection,
  createTikTokServiceContext,
  disconnectTikTokConnection,
  ensureFreshTikTokAccessToken,
  publishTikTokManualVideo,
  startTikTokOAuth
} from "./tiktok-service.js";
import { TikTokStore } from "./tiktok-store.js";
import { sanitizeTikTokError, sanitizeTikTokText, tiktokLogSecrets } from "./tiktok-sanitize.js";
import type { TikTokConnection, TikTokEnv } from "./tiktok-types.js";

interface DisconnectSession {
  sessionId: string;
  discordGuildId: string;
  discordUserId: string;
  expiresAt: number;
}

const disconnectSessions = new Map<string, DisconnectSession>();
const disconnectTtlMs = 5 * 60 * 1000;

export function isTikTokGuildInteraction(interaction: Interaction): boolean {
  if (!("customId" in interaction)) {
    return false;
  }
  return isTikTokDisconnectButton(interaction.customId) || isTikTokRepublishComponent(interaction.customId);
}

export { isTikTokPendingDmButton };

export async function handleTikTokPendingDmButton(interaction: ButtonInteraction, env: BotEnv, rootDir: string): Promise<boolean> {
  if (!isTikTokPendingDmButton(interaction.customId)) {
    return false;
  }
  const tiktokEnv = loadTikTokEnv(rootDir, { requireConfigured: true });
  const ctx = createTikTokServiceContext(rootDir, env, tiktokEnv);
  const pendingState = tiktokIdFromCustomId(interaction.customId);
  try {
    if (interaction.customId.startsWith("tiktok:pending:confirm:")) {
      const guild = await interaction.client.guilds.fetch(env.DISCORD_GUILD_ID);
      const message = await confirmTikTokPendingConnection(ctx, {
        pendingState,
        discordUserId: interaction.user.id,
        guild
      });
      await interaction.reply({ content: message });
      return true;
    }
    const message = await cancelTikTokPendingConnection(ctx, pendingState, interaction.user.id);
    await interaction.reply({ content: message });
    return true;
  } catch (error) {
    await interaction.reply({ content: sanitizeTikTokError(error, env, tiktokEnv) }).catch(() => undefined);
    return true;
  }
}

export async function handleTikTokCommand(interaction: ChatInputCommandInteraction, env: BotEnv, rootDir: string): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const tiktokEnv = loadTikTokEnv(rootDir, { requireConfigured: sub !== "estado" });
  const store = new TikTokStore(rootDir);
  const state = await store.read();
  if (!tiktokEnv.enabled && sub !== "estado") {
    await interaction.reply({ content: "TikTok Alerts esta desactivado. Configura TIKTOK_ALERTS_ENABLED=true para usar este comando.", flags: MessageFlags.Ephemeral });
    return;
  }
  const ctx = createTikTokServiceContext(rootDir, env, tiktokEnv);

  switch (sub) {
    case "conectar": {
      if (state.connection) {
        await interaction.reply({ content: "Ya hay una cuenta TikTok conectada. Usa /tiktok desconectar antes de conectar otra.", flags: MessageFlags.Ephemeral });
        return;
      }
      const url = await startTikTokOAuth(ctx, interaction.user.id);
      await interaction.reply({
        content: "Abre el enlace para conectar la cuenta TikTok. El enlace expira en 10 minutos.",
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel("Conectar cuenta TikTok").setStyle(ButtonStyle.Link).setURL(url)
          )
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    case "estado":
      await interaction.reply({ content: await formatTikTokStatus(interaction, env, tiktokEnv, state.connection), flags: MessageFlags.Ephemeral });
      return;
    case "activar":
    case "desactivar":
      await store.update((data) => {
        if (data.connection) {
          data.connection.enabled = sub === "activar";
        }
      });
      await interaction.reply({ content: sub === "activar" ? "Monitoreo TikTok activado." : "Monitoreo TikTok desactivado. La cuenta permanece conectada.", flags: MessageFlags.Ephemeral });
      return;
    case "desconectar": {
      if (!state.connection) {
        await interaction.reply({ content: "No hay cuenta TikTok conectada.", flags: MessageFlags.Ephemeral });
        return;
      }
      const sessionId = createDisconnectSession(interaction.guildId!, interaction.user.id);
      await interaction.reply({ ...buildTikTokDisconnectConfirmationPayload(sessionId), flags: MessageFlags.Ephemeral });
      return;
    }
    case "prueba":
      await handleTikTokTestCommand(interaction, env, tiktokEnv, rootDir);
      return;
    case "republicar":
      await handleTikTokRepublishCommand(interaction, env, tiktokEnv, rootDir);
      return;
    default:
      await interaction.reply({ content: "Subcomando TikTok no reconocido.", flags: MessageFlags.Ephemeral });
  }
}

export async function handleTikTokGuildComponent(interaction: ButtonInteraction | StringSelectMenuInteraction, env: BotEnv, rootDir: string): Promise<boolean> {
  if (!("customId" in interaction) || !isTikTokGuildInteraction(interaction)) {
    return false;
  }
  const tiktokEnv = loadTikTokEnv(rootDir, { requireConfigured: true });
  if (!interaction.guild || interaction.guildId !== env.DISCORD_GUILD_ID) {
    return true;
  }
  const member = interaction.member instanceof GuildMember ? interaction.member : await interaction.guild.members.fetch(interaction.user.id);
  if (!memberHasAnyRole(member, adminRoleNames())) {
    await interaction.reply({ content: "No tienes permisos para usar controles TikTok.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.isButton() && isTikTokDisconnectButton(interaction.customId)) {
    await handleTikTokDisconnectButton(interaction, env, tiktokEnv, rootDir);
    return true;
  }
  if (isTikTokRepublishComponent(interaction.customId)) {
    await handleTikTokRepublishComponent(interaction, env, tiktokEnv, rootDir);
    return true;
  }
  return false;
}

async function handleTikTokTestCommand(interaction: ChatInputCommandInteraction, env: BotEnv, tiktokEnv: TikTokEnv, rootDir: string): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const store = new TikTokStore(rootDir);
  const state = await store.read();
  if (!state.connection) {
    await interaction.editReply("No hay cuenta TikTok conectada.");
    return;
  }
  const ctx = createTikTokServiceContext(rootDir, env, tiktokEnv);
  const { accessToken } = await ensureFreshTikTokAccessToken(ctx, state.connection);
  const page = await new TikTokApiClient(tiktokEnv).listVideos(accessToken, 1);
  const video = page.videos[0];
  if (!video) {
    await interaction.editReply("La cuenta no tiene videos publicos.");
    return;
  }
  await publishTikTokManualVideo(ctx, interaction.guild!, video, "test");
  await interaction.editReply(`Video de prueba publicado en <#${env.GENERAL_CHAT_CHANNEL_ID}>.`);
}

async function handleTikTokRepublishCommand(interaction: ChatInputCommandInteraction, env: BotEnv, tiktokEnv: TikTokEnv, rootDir: string): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const store = new TikTokStore(rootDir);
  const state = await store.read();
  if (!state.connection) {
    await interaction.editReply("No hay cuenta TikTok conectada.");
    return;
  }
  const ctx = createTikTokServiceContext(rootDir, env, tiktokEnv);
  const { connection, accessToken } = await ensureFreshTikTokAccessToken(ctx, state.connection);
  const firstPage = await new TikTokApiClient(tiktokEnv).listVideos(accessToken, 20);
  if (firstPage.videos.length === 0) {
    await interaction.editReply("La cuenta no tiene videos publicos.");
    return;
  }
  const session = createTikTokRepublishSession({
    discordGuildId: interaction.guildId!,
    discordUserId: interaction.user.id,
    openId: connection.openId,
    displayName: connection.displayName,
    firstPage
  });
  await interaction.editReply(buildTikTokRepublishMessage(session));
}

async function handleTikTokDisconnectButton(interaction: ButtonInteraction, env: BotEnv, tiktokEnv: TikTokEnv, rootDir: string): Promise<void> {
  const session = getDisconnectSession(tiktokIdFromCustomId(interaction.customId));
  if (!session || session.discordGuildId !== interaction.guildId || session.discordUserId !== interaction.user.id) {
    await interaction.reply({ content: "Esta confirmacion expiro o pertenece a otro usuario.", flags: MessageFlags.Ephemeral });
    return;
  }
  deleteDisconnectSession(session.sessionId);
  if (interaction.customId.startsWith(tiktokDisconnectCancelPrefix)) {
    await interaction.reply({ content: "Desconexion TikTok cancelada.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.customId.startsWith(tiktokDisconnectConfirmPrefix)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const disconnected = await disconnectTikTokConnection(createTikTokServiceContext(rootDir, env, tiktokEnv));
    await interaction.editReply(disconnected ? "Cuenta TikTok desconectada y revocada cuando fue posible." : "No hay cuenta TikTok conectada.");
  }
}

async function handleTikTokRepublishComponent(interaction: ButtonInteraction | StringSelectMenuInteraction, env: BotEnv, tiktokEnv: TikTokEnv, rootDir: string): Promise<void> {
  const session = getTikTokRepublishSession(tiktokRepublishSessionId(interaction.customId));
  if (!session || session.discordGuildId !== interaction.guildId || session.discordUserId !== interaction.user.id) {
    await interaction.reply({ content: "La sesion de republicacion expiro o pertenece a otro usuario.", flags: MessageFlags.Ephemeral });
    return;
  }
  const store = new TikTokStore(rootDir);
  const state = await store.read();
  if (!state.connection || state.connection.openId !== session.openId) {
    await interaction.reply({ content: "La cuenta TikTok conectada cambio. Ejecuta /tiktok republicar nuevamente.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(tiktokRepublishSelectPrefix)) {
    const page = currentTikTokRepublishPage(session);
    const selected = page.videos.find((video) => video.id === interaction.values[0]);
    if (!selected) {
      await interaction.reply({ content: "El video seleccionado no pertenece a la pagina actual. Ejecuta /tiktok republicar nuevamente.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await publishTikTokManualVideo(createTikTokServiceContext(rootDir, env, tiktokEnv), interaction.guild!, selected, "repost");
    await interaction.editReply(`Video republicado en <#${env.GENERAL_CHAT_CHANNEL_ID}>.`);
    return;
  }

  if (!interaction.isButton()) {
    return;
  }
  if (interaction.customId.startsWith(tiktokRepublishPrevPrefix)) {
    moveTikTokRepublishPage(session, "prev");
    await interaction.update(buildTikTokRepublishMessage(session));
    return;
  }
  if (interaction.customId.startsWith(tiktokRepublishNextPrefix)) {
    const page = currentTikTokRepublishPage(session);
    if (session.currentPageIndex < session.pages.length - 1) {
      moveTikTokRepublishPage(session, "next");
      await interaction.update(buildTikTokRepublishMessage(session));
      return;
    }
    if (!page.hasMore) {
      await interaction.reply({ content: "No hay mas paginas.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!page.cursor) {
      await logTikTokInteraction(rootDir, env, tiktokEnv, "TikTok has_more sin cursor.", { sessionId: session.sessionId });
      await interaction.reply({ content: "TikTok indico mas resultados pero no devolvio un cursor valido.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    const ctx = createTikTokServiceContext(rootDir, env, tiktokEnv);
    const { accessToken } = await ensureFreshTikTokAccessToken(ctx, state.connection);
    const nextPage = await new TikTokApiClient(tiktokEnv).listVideos(accessToken, 20, page.cursor);
    saveTikTokRepublishPage(session, nextPage);
    await interaction.editReply(buildTikTokRepublishMessage(session));
  }
}

async function formatTikTokStatus(
  interaction: ChatInputCommandInteraction,
  env: BotEnv,
  tiktokEnv: TikTokEnv,
  connection: TikTokConnection | null
): Promise<string> {
  const channel = await interaction.guild?.channels.fetch(env.GENERAL_CHAT_CHANNEL_ID).catch(() => null);
  const destination = channel ? `<#${channel.id}>` : env.GENERAL_CHAT_CHANNEL_ID;
  return [
    "TikTok Alerts",
    `Modulo: ${tiktokEnv.enabled ? "activo" : "inactivo"}`,
    `Cuenta conectada: ${connection ? "si" : "no"}`,
    connection ? `Cuenta: ${connection.displayName}` : "",
    connection ? `Open ID: ${maskIdentifier(connection.openId)}` : "",
    connection ? `Monitoreo: ${connection.enabled ? "activo" : "inactivo"}` : "",
    connection?.lastCheckAt ? `Ultima comprobacion: ${connection.lastCheckAt}` : "Ultima comprobacion: sin datos",
    connection?.lastSuccessAt ? `Ultimo exito: ${connection.lastSuccessAt}` : "Ultimo exito: sin datos",
    connection?.lastVideoId ? `Ultimo video detectado: ${maskIdentifier(connection.lastVideoId)}` : "Ultimo video detectado: sin datos",
    connection ? `Estado del token: access expira ${connection.accessTokenExpiresAt}` : "Estado del token: sin conexion",
    `Destino: ${destination}`,
    `Polling: ${tiktokEnv.pollingIntervalSeconds}s`,
    `Mencion configurada: ${tiktokEnv.mention}`
  ].filter(Boolean).join("\n");
}

function createDisconnectSession(discordGuildId: string, discordUserId: string): string {
  const now = Date.now();
  for (const [id, session] of disconnectSessions) {
    if (session.expiresAt <= now) {
      disconnectSessions.delete(id);
    }
  }
  const sessionId = randomTikTokId("ttd");
  disconnectSessions.set(sessionId, {
    sessionId,
    discordGuildId,
    discordUserId,
    expiresAt: now + disconnectTtlMs
  });
  return sessionId;
}

function getDisconnectSession(sessionId: string): DisconnectSession | null {
  const session = disconnectSessions.get(sessionId) ?? null;
  if (!session || session.expiresAt <= Date.now()) {
    disconnectSessions.delete(sessionId);
    return null;
  }
  return session;
}

function deleteDisconnectSession(sessionId: string): void {
  disconnectSessions.delete(sessionId);
}

async function logTikTokInteraction(rootDir: string, env: BotEnv, tiktokEnv: TikTokEnv, message: string, details?: unknown): Promise<void> {
  await new OperationLogger(path.join(rootDir, "logs"), tiktokLogSecrets(env, tiktokEnv))
    .log(message, sanitizeTikTokText(JSON.stringify(details ?? {}), env, tiktokEnv))
    .catch(() => undefined);
}
