import { Guild } from "discord.js";
import path from "node:path";
import type { BotEnv } from "./bot-config.js";
import { botEnvSecrets } from "./bot-config.js";
import { adminRoleNames, memberHasAnyRole } from "./command-permissions.js";
import { OperationLogger } from "./logger.js";
import { TikTokApiClient, grantedScopes, hasRequiredScopes } from "./tiktok-api-client.js";
import { buildTikTokPendingConfirmationPayload } from "./tiktok-components.js";
import { decryptToken, encryptToken, maskIdentifier, randomTikTokId } from "./tiktok-crypto.js";
import { publishTikTokVideo } from "./tiktok-publisher.js";
import {
  TikTokStore,
  addOAuthState,
  clearConnection,
  consumeOAuthState,
  hasPublishedVideo,
  latestVideoId,
  markVideoPublished,
  markVideosPublished,
  removePendingConnection,
  saveConnection,
  takePendingConnection,
  upsertPendingConnection
} from "./tiktok-store.js";
import type {
  TikTokConnection,
  TikTokEnv,
  TikTokPendingConnection,
  TikTokPublishKind,
  TikTokTokenResponse,
  TikTokVideo
} from "./tiktok-types.js";
import { sanitizeTikTokError, tiktokLogSecrets } from "./tiktok-sanitize.js";

const oauthTtlMs = 10 * 60 * 1000;
const refreshMarginMs = 5 * 60 * 1000;

export interface TikTokServiceContext {
  rootDir: string;
  env: BotEnv;
  tiktokEnv: TikTokEnv;
  store?: TikTokStore;
  api?: TikTokApiClient;
  logger?: OperationLogger;
}

export function createTikTokServiceContext(rootDir: string, env: BotEnv, tiktokEnv: TikTokEnv): Required<TikTokServiceContext> {
  return {
    rootDir,
    env,
    tiktokEnv,
    store: new TikTokStore(rootDir),
    api: new TikTokApiClient(tiktokEnv),
    logger: new OperationLogger(path.join(rootDir, "logs"), tiktokLogSecrets(env, tiktokEnv))
  };
}

export async function startTikTokOAuth(ctx: TikTokServiceContext, discordUserId: string, now = new Date()): Promise<string> {
  const store = ctx.store ?? new TikTokStore(ctx.rootDir);
  const api = ctx.api ?? new TikTokApiClient(ctx.tiktokEnv);
  const state = randomTikTokId("tto");
  await store.update((data) => {
    addOAuthState(data, {
      state,
      discordUserId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + oauthTtlMs).toISOString(),
      used: false
    });
  });
  await logTikTok(ctx, "TikTok OAuth iniciado.", { discordUserId });
  return api.buildAuthorizeUrl(state);
}

export async function handleTikTokOAuthCallback(ctx: TikTokServiceContext, input: {
  code?: string;
  state?: string;
  sendDm: (discordUserId: string, payload: ReturnType<typeof buildTikTokPendingConfirmationPayload>) => Promise<void>;
  now?: Date;
}): Promise<{ status: number; body: string }> {
  if (!input.code || !input.state) {
    return { status: 400, body: "Callback TikTok incompleto." };
  }

  const now = input.now ?? new Date();
  const store = ctx.store ?? new TikTokStore(ctx.rootDir);
  const api = ctx.api ?? new TikTokApiClient(ctx.tiktokEnv);
  const oauthEntry = await store.update((data) => consumeOAuthState(data, input.state!, now));
  if (!oauthEntry) {
    await logTikTok(ctx, "TikTok OAuth rechazado por state invalido o expirado.");
    return { status: 400, body: safeHtml("La autorizacion expiro o ya fue utilizada. Inicia /tiktok conectar nuevamente.") };
  }

  let tokenResponse: TikTokTokenResponse | null = null;
  try {
    tokenResponse = await api.exchangeCode(input.code);
    const scopes = grantedScopes(tokenResponse.scope);
    if (!hasRequiredScopes(scopes)) {
      await api.revokeToken(tokenResponse.access_token).catch(() => undefined);
      await logTikTok(ctx, "TikTok OAuth sin scopes requeridos.", { discordUserId: oauthEntry.discordUserId, scopes });
      return { status: 400, body: safeHtml("TikTok no concedio los permisos requeridos. Intenta de nuevo aceptando user.info.basic y video.list.") };
    }
    const userInfo = await api.userInfo(tokenResponse.access_token);
    const pending: TikTokPendingConnection = {
      state: oauthEntry.state,
      discordUserId: oauthEntry.discordUserId,
      openId: userInfo.openId,
      displayName: userInfo.displayName,
      avatarUrl: userInfo.avatarUrl,
      scopes,
      encryptedAccessToken: encryptToken(tokenResponse.access_token, ctx.tiktokEnv.tokenEncryptionKey),
      encryptedRefreshToken: encryptToken(tokenResponse.refresh_token, ctx.tiktokEnv.tokenEncryptionKey),
      accessTokenExpiresAt: expiresAt(now, tokenResponse.expires_in),
      refreshTokenExpiresAt: expiresAt(now, tokenResponse.refresh_expires_in),
      expiresAt: new Date(now.getTime() + oauthTtlMs).toISOString()
    };
    await store.update((data) => upsertPendingConnection(data, pending));
    try {
      await input.sendDm(oauthEntry.discordUserId, buildTikTokPendingConfirmationPayload({ state: pending.state, displayName: pending.displayName }));
    } catch (dmError) {
      await api.revokeToken(tokenResponse.access_token).catch(() => undefined);
      await store.update((data) => removePendingConnection(data, pending.state));
      await logTikTok(ctx, "TikTok OAuth cancelado por fallo de DM.", { discordUserId: oauthEntry.discordUserId, error: sanitizeTikTokError(dmError, ctx.env, ctx.tiktokEnv) });
      return { status: 200, body: safeHtml("TikTok autorizo la cuenta, pero Discord no pudo enviar DM. Habilita mensajes directos y vuelve a intentar.") };
    }
    await logTikTok(ctx, "TikTok confirmacion pendiente enviada.", { discordUserId: oauthEntry.discordUserId, openId: maskIdentifier(userInfo.openId) });
    return { status: 200, body: safeHtml("Cuenta TikTok detectada. Revisa tus mensajes directos de Discord para confirmar.") };
  } catch (error) {
    if (tokenResponse?.access_token) {
      await api.revokeToken(tokenResponse.access_token).catch(() => undefined);
    }
    await logTikTok(ctx, "TikTok OAuth fallo.", { error: sanitizeTikTokError(error, ctx.env, ctx.tiktokEnv) });
    return { status: 500, body: safeHtml("No se pudo completar la autorizacion de TikTok. Intenta nuevamente.") };
  }
}

export async function confirmTikTokPendingConnection(ctx: TikTokServiceContext, input: {
  pendingState: string;
  discordUserId: string;
  guild: Guild;
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const store = ctx.store ?? new TikTokStore(ctx.rootDir);
  const api = ctx.api ?? new TikTokApiClient(ctx.tiktokEnv);
  const member = await input.guild.members.fetch(input.discordUserId);
  if (!memberHasAnyRole(member, adminRoleNames())) {
    throw new Error("Ya no tienes permisos administrativos para confirmar TikTok.");
  }

  const pending = await store.update((data) => takePendingConnection(data, input.pendingState));
  if (!pending) {
    throw new Error("La confirmacion TikTok expiro o ya fue utilizada.");
  }
  if (pending.discordUserId !== input.discordUserId) {
    await store.update((data) => upsertPendingConnection(data, pending));
    throw new Error("Esta confirmacion pertenece a otro usuario Discord.");
  }
  if (new Date(pending.expiresAt).getTime() <= now.getTime()) {
    await revokePending(ctx, pending);
    throw new Error("La confirmacion TikTok expiro. Ejecuta /tiktok conectar nuevamente.");
  }

  const accessToken = decryptToken(pending.encryptedAccessToken, ctx.tiktokEnv.tokenEncryptionKey);
  const baseline = await api.listVideos(accessToken, 20);
  const connection = connectionFromPending(pending, now);
  connection.lastCheckAt = now.toISOString();
  connection.lastSuccessAt = now.toISOString();
  connection.lastVideoId = latestVideoId(baseline.videos);
  await store.update((data) => {
    saveConnection(data, connection);
    markVideosPublished(data, connection.openId, baseline.videos, now);
  });
  await logTikTok(ctx, "TikTok cuenta conectada.", {
    discordUserId: input.discordUserId,
    openId: maskIdentifier(connection.openId),
    baselineVideos: baseline.videos.length
  });
  return `Cuenta TikTok conectada: ${connection.displayName}. Se genero baseline con ${baseline.videos.length} videos existentes.`;
}

export async function cancelTikTokPendingConnection(ctx: TikTokServiceContext, pendingState: string, discordUserId: string): Promise<string> {
  const store = ctx.store ?? new TikTokStore(ctx.rootDir);
  const pending = await store.update((data) => takePendingConnection(data, pendingState));
  if (!pending) {
    return "La confirmacion TikTok expiro o ya fue procesada.";
  }
  if (pending.discordUserId !== discordUserId) {
    await store.update((data) => upsertPendingConnection(data, pending));
    return "Esta confirmacion pertenece a otro usuario Discord.";
  }
  await revokePending(ctx, pending);
  await logTikTok(ctx, "TikTok confirmacion cancelada.", { discordUserId });
  return "Conexion TikTok cancelada.";
}

export async function disconnectTikTokConnection(ctx: TikTokServiceContext): Promise<boolean> {
  const store = ctx.store ?? new TikTokStore(ctx.rootDir);
  const connection = await store.update((data) => clearConnection(data));
  if (!connection) {
    return false;
  }
  await revokeConnection(ctx, connection);
  await logTikTok(ctx, "TikTok cuenta desconectada.", { openId: maskIdentifier(connection.openId) });
  return true;
}

export async function ensureFreshTikTokAccessToken(ctx: TikTokServiceContext, connection: TikTokConnection, now = new Date()): Promise<{ connection: TikTokConnection; accessToken: string }> {
  if (new Date(connection.accessTokenExpiresAt).getTime() - now.getTime() > refreshMarginMs) {
    return { connection, accessToken: decryptToken(connection.encryptedAccessToken, ctx.tiktokEnv.tokenEncryptionKey) };
  }
  const api = ctx.api ?? new TikTokApiClient(ctx.tiktokEnv);
  const refreshToken = decryptToken(connection.encryptedRefreshToken, ctx.tiktokEnv.tokenEncryptionKey);
  const refreshed = await api.refreshToken(refreshToken);
  const updated: TikTokConnection = {
    ...connection,
    scopes: grantedScopes(refreshed.scope),
    encryptedAccessToken: encryptToken(refreshed.access_token, ctx.tiktokEnv.tokenEncryptionKey),
    encryptedRefreshToken: encryptToken(refreshed.refresh_token || refreshToken, ctx.tiktokEnv.tokenEncryptionKey),
    accessTokenExpiresAt: expiresAt(now, refreshed.expires_in),
    refreshTokenExpiresAt: expiresAt(now, refreshed.refresh_expires_in)
  };
  const store = ctx.store ?? new TikTokStore(ctx.rootDir);
  await store.update((data) => {
    if (data.connection?.openId === connection.openId) {
      data.connection = updated;
    }
  });
  await logTikTok(ctx, "TikTok token refreshed.", { openId: maskIdentifier(connection.openId) });
  return { connection: updated, accessToken: refreshed.access_token };
}

export async function runTikTokPollingOnce(ctx: TikTokServiceContext, guild: Guild, now = new Date()): Promise<number> {
  const store = ctx.store ?? new TikTokStore(ctx.rootDir);
  const api = ctx.api ?? new TikTokApiClient(ctx.tiktokEnv);
  const state = await store.read();
  const connection = state.connection;
  if (!connection || !connection.enabled) {
    return 0;
  }
  const { connection: freshConnection, accessToken } = await ensureFreshTikTokAccessToken(ctx, connection, now);
  const page = await api.listVideos(accessToken, 20);
  const connectedAtMs = new Date(freshConnection.connectedAt).getTime();
  const candidates = page.videos
    .filter((video) => !hasPublishedVideo(state, freshConnection.openId, video.id))
    .filter((video) => !video.createTime || video.createTime * 1000 >= connectedAtMs)
    .sort((left, right) => (left.createTime ?? 0) - (right.createTime ?? 0));
  let published = 0;
  for (const video of candidates) {
    const current = await store.read();
    if (!current.connection || current.connection.openId !== freshConnection.openId || hasPublishedVideo(current, freshConnection.openId, video.id)) {
      continue;
    }
    await publishTikTokVideo(guild, ctx.env, ctx.tiktokEnv, { displayName: freshConnection.displayName, video, kind: "auto" });
    await store.update((data) => {
      if (data.connection?.openId === freshConnection.openId) {
        markVideoPublished(data, freshConnection.openId, video, now);
        data.connection.lastVideoId = video.id;
        data.connection.lastCheckAt = now.toISOString();
        data.connection.lastSuccessAt = now.toISOString();
      }
    });
    await logTikTok(ctx, "TikTok nuevo video publicado.", { openId: maskIdentifier(freshConnection.openId), videoId: maskIdentifier(video.id) });
    published += 1;
  }
  if (published === 0) {
    await store.update((data) => {
      if (data.connection?.openId === freshConnection.openId) {
        data.connection.lastCheckAt = now.toISOString();
        data.connection.lastSuccessAt = now.toISOString();
      }
    });
  }
  return published;
}

export async function publishTikTokManualVideo(ctx: TikTokServiceContext, guild: Guild, video: TikTokVideo, kind: TikTokPublishKind): Promise<void> {
  const store = ctx.store ?? new TikTokStore(ctx.rootDir);
  const state = await store.read();
  if (!state.connection) {
    throw new Error("No hay cuenta TikTok conectada.");
  }
  await publishTikTokVideo(guild, ctx.env, ctx.tiktokEnv, {
    displayName: state.connection.displayName,
    video,
    kind
  });
  if (kind === "test") {
    await store.update((data) => {
      if (data.connection) {
        markVideoPublished(data, data.connection.openId, video);
        data.connection.lastVideoId = video.id;
        data.connection.lastCheckAt = new Date().toISOString();
        data.connection.lastSuccessAt = new Date().toISOString();
      }
    });
  }
  await logTikTok(ctx, kind === "repost" ? "TikTok republicacion manual." : "TikTok prueba manual publicada.", {
    videoId: maskIdentifier(video.id)
  });
}

export function connectionFromPending(pending: TikTokPendingConnection, now = new Date()): TikTokConnection {
  return {
    openId: pending.openId,
    displayName: pending.displayName,
    avatarUrl: pending.avatarUrl,
    scopes: pending.scopes,
    encryptedAccessToken: pending.encryptedAccessToken,
    encryptedRefreshToken: pending.encryptedRefreshToken,
    connectedAt: now.toISOString(),
    accessTokenExpiresAt: pending.accessTokenExpiresAt,
    refreshTokenExpiresAt: pending.refreshTokenExpiresAt,
    enabled: true
  };
}

async function revokePending(ctx: TikTokServiceContext, pending: TikTokPendingConnection): Promise<void> {
  const api = ctx.api ?? new TikTokApiClient(ctx.tiktokEnv);
  const token = decryptToken(pending.encryptedAccessToken, ctx.tiktokEnv.tokenEncryptionKey);
  await api.revokeToken(token).catch((error) => logTikTok(ctx, "TikTok revoke pending fallo.", { error: sanitizeTikTokError(error, ctx.env, ctx.tiktokEnv) }));
}

async function revokeConnection(ctx: TikTokServiceContext, connection: TikTokConnection): Promise<void> {
  const api = ctx.api ?? new TikTokApiClient(ctx.tiktokEnv);
  const token = decryptToken(connection.encryptedAccessToken, ctx.tiktokEnv.tokenEncryptionKey);
  await api.revokeToken(token).catch((error) => logTikTok(ctx, "TikTok revoke connection fallo.", { error: sanitizeTikTokError(error, ctx.env, ctx.tiktokEnv) }));
}

function expiresAt(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function safeHtml(message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>TikTok</title></head><body><p>${escapeHtml(message)}</p></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
}

async function logTikTok(ctx: TikTokServiceContext, message: string, details?: unknown): Promise<void> {
  const logger = ctx.logger ?? new OperationLogger(path.join(ctx.rootDir, "logs"), [...botEnvSecrets(ctx.env), ...tiktokLogSecrets(ctx.env, ctx.tiktokEnv)]);
  await logger.log(message, details).catch(() => undefined);
}
