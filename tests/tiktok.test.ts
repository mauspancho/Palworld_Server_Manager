import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChannelType, Collection } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commandAccessLevel } from "../src/command-access.js";
import { slashCommandDefinitions } from "../src/commands-definitions.js";
import { loadTikTokEnv, parseTikTokEncryptionKey } from "../src/tiktok-config.js";
import { TikTokApiClient, grantedScopes, hasRequiredScopes, tiktokAuthorizeEndpoint, tiktokTokenEndpoint, tiktokUserInfoEndpoint, tiktokVideoListEndpoint } from "../src/tiktok-api-client.js";
import { decryptToken, encryptToken } from "../src/tiktok-crypto.js";
import { buildTikTokDiscordPayload, validateTikTokDestination } from "../src/tiktok-publisher.js";
import { createTikTokRepublishSession, currentTikTokRepublishPage, moveTikTokRepublishPage, saveTikTokRepublishPage } from "../src/tiktok-republish-state.js";
import { handleTikTokCommand, handleTikTokGuildComponent, handleTikTokPendingDmButton } from "../src/tiktok-interactions.js";
import { tiktokPendingConfirmPrefix } from "../src/tiktok-components.js";
import { tiktokRepublishNextPrefix, tiktokRepublishSelectPrefix } from "../src/tiktok-republish-ui.js";
import { handleTikTokOAuthCallback, runTikTokPollingOnce, startTikTokOAuth, ensureFreshTikTokAccessToken, publishTikTokManualVideo, confirmTikTokPendingConnection, cleanupTikTokExpiredArtifacts } from "../src/tiktok-service.js";
import { TikTokStore, addOAuthState, consumeOAuthState, emptyTikTokState, hasPublishedVideo, markVideoPublished, markVideosPublished, tiktokStatePath, upsertPendingConnection, findActivePendingConnectionForUser } from "../src/tiktok-store.js";
import { sanitizeTikTokText } from "../src/tiktok-sanitize.js";
import type { BotEnv } from "../src/bot-config.js";
import type { TikTokEnv, TikTokPendingConnection, TikTokVideo } from "../src/tiktok-types.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("tiktok config and official API", () => {
  it("does not require TikTok variables when disabled", async () => {
    const dir = await tempDir();
    process.env.TIKTOK_ALERTS_ENABLED = "false";

    expect(loadTikTokEnv(dir).enabled).toBe(false);
  });

  it("validates required TikTok variables when enabled", async () => {
    const dir = await tempDir();
    process.env.TIKTOK_ALERTS_ENABLED = "true";

    expect(() => loadTikTokEnv(dir)).toThrow(/TIKTOK_CLIENT_KEY/);
  });

  it("rejects invalid encryption keys", () => {
    expect(() => parseTikTokEncryptionKey("bad")).toThrow(/32 bytes/);
  });

  it("accepts base64 and hexadecimal 32 byte encryption keys", () => {
    expect(parseTikTokEncryptionKey(keyBase64()).length).toBe(32);
    expect(parseTikTokEncryptionKey(Buffer.alloc(32, 2).toString("hex")).length).toBe(32);
  });

  it("builds authorize URL with Login Kit v2 scopes and state", () => {
    const api = new TikTokApiClient(tiktokEnv());
    const url = new URL(api.buildAuthorizeUrl("state-1"));

    expect(url.toString()).toContain(tiktokAuthorizeEndpoint);
    expect(url.searchParams.get("client_key")).toBe("client-key");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.test/tiktok/callback");
    expect(url.searchParams.get("scope")).toBe("user.info.basic,video.list");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("uses official token, user info and video endpoints", async () => {
    const calls: string[] = [];
    const api = new TikTokApiClient(tiktokEnv(), {
      fetchImpl: vi.fn(async (url) => {
        calls.push(String(url));
        if (String(url).startsWith(tiktokUserInfoEndpoint)) {
          return jsonResponse({ data: { user: { open_id: "open", display_name: "Creator" } } });
        }
        if (String(url).startsWith(tiktokVideoListEndpoint)) {
          return jsonResponse({ data: { videos: [{ id: "v1", share_url: "https://tiktok.test/v1" }], has_more: false } });
        }
        return jsonResponse({ access_token: "access", refresh_token: "refresh", expires_in: 3600, refresh_expires_in: 86400, open_id: "open", scope: "user.info.basic,video.list" });
      }) as any
    });

    await api.exchangeCode("code");
    await api.refreshToken("refresh");
    await api.userInfo("access");
    await api.listVideos("access");

    expect(calls.some((url) => url === tiktokTokenEndpoint)).toBe(true);
    expect(calls.some((url) => url.startsWith(tiktokUserInfoEndpoint))).toBe(true);
    expect(calls.some((url) => url.startsWith(tiktokVideoListEndpoint))).toBe(true);
  });

  it("checks scopes regardless of order", () => {
    expect(hasRequiredScopes(grantedScopes("video.list,user.info.basic"))).toBe(true);
    expect(hasRequiredScopes(grantedScopes("user.info.basic"))).toBe(false);
  });
});

describe("tiktok state, encryption and OAuth", () => {
  it("generates one-use OAuth states with ten minute expiration", async () => {
    const dir = await tempDir();
    const env = tiktokEnv();
    const store = new TikTokStore(dir);
    const url = await startTikTokOAuth({ rootDir: dir, env: botEnv(), tiktokEnv: env, store, api: new TikTokApiClient(env) }, "discord-user", new Date("2026-08-15T00:00:00.000Z"));
    const stateValue = new URL(url).searchParams.get("state")!;
    const data = await store.read();
    const state = data.oauthStates[0]!;

    expect(state.state).toBe(stateValue);
    expect(state.state).not.toBe("discord-user");
    expect(state.expiresAt).toBe("2026-08-15T00:10:00.000Z");
    expect(consumeOAuthState(data, state.state, new Date("2026-08-15T00:01:00.000Z"))).toBeTruthy();
    expect(consumeOAuthState(data, state.state, new Date("2026-08-15T00:02:00.000Z"))).toBeNull();
  });

  it("expires OAuth state after ten minutes", () => {
    const state = emptyTikTokState();
    addOAuthState(state, {
      state: "s",
      discordUserId: "u",
      createdAt: "2026-08-15T00:00:00.000Z",
      expiresAt: "2026-08-15T00:10:00.000Z",
      used: false
    });

    expect(consumeOAuthState(state, "s", new Date("2026-08-15T00:10:01.000Z"))).toBeNull();
  });

  it("encrypts tokens with random IV and decrypts them", () => {
    const key = parseTikTokEncryptionKey(keyBase64());
    const first = encryptToken("access-plain", key);
    const second = encryptToken("access-plain", key);

    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(decryptToken(first, key)).toBe("access-plain");
  });

  it("does not write plaintext access or refresh tokens to data", async () => {
    const dir = await tempDir();
    const key = parseTikTokEncryptionKey(keyBase64());
    const store = new TikTokStore(dir);
    await store.update((state) => {
      state.connection = {
        openId: "open",
        displayName: "Creator",
        scopes: ["user.info.basic", "video.list"],
        encryptedAccessToken: encryptToken("plain-access-token", key),
        encryptedRefreshToken: encryptToken("plain-refresh-token", key),
        connectedAt: new Date().toISOString(),
        accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
        enabled: true
      };
    });

    const raw = await fs.readFile(tiktokStatePath(dir), "utf8");
    expect(raw).not.toContain("plain-access-token");
    expect(raw).not.toContain("plain-refresh-token");
  });

  it("callback without code or state returns 400", async () => {
    const result = await handleTikTokOAuthCallback(context(await tempDir()), { sendDm: async () => undefined });

    expect(result.status).toBe(400);
    expect(result.body).toContain("Callback TikTok incompleto");
  });

  it("valid callback creates pending connection but not final connection", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await store.update((state) => addOAuthState(state, oauthState("oauth", "admin")));
    const sendDm = vi.fn(async () => undefined);
    const ctx = context(dir, store, fakeApi({
      exchangeCode: async () => tokenResponse("access-secret", "refresh-secret"),
      userInfo: async () => ({ openId: "open-1", displayName: "Creator" })
    }));

    const result = await handleTikTokOAuthCallback(ctx, { code: "code-secret", state: "oauth", sendDm, now: new Date("2026-08-15T00:01:00.000Z") });
    const data = await store.read();

    expect(result.status).toBe(200);
    expect(data.connection).toBeNull();
    expect(data.pendingConnections).toHaveLength(1);
    expect(sendDm).toHaveBeenCalledWith("admin", expect.objectContaining({ content: expect.stringContaining("Creator") }));
  });

  it("incomplete scopes revoke and do not connect", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await store.update((state) => addOAuthState(state, oauthState("oauth", "admin")));
    const revoke = vi.fn(async () => undefined);
    const ctx = context(dir, store, fakeApi({
      exchangeCode: async () => tokenResponse("access-secret", "refresh-secret", "user.info.basic"),
      revokeToken: revoke
    }));

    const result = await handleTikTokOAuthCallback(ctx, { code: "code-secret", state: "oauth", sendDm: async () => undefined, now: new Date("2026-08-15T00:01:00.000Z") });
    const data = await store.read();

    expect(result.status).toBe(400);
    expect(revoke).toHaveBeenCalledWith("access-secret");
    expect(data.connection).toBeNull();
    expect(data.pendingConnections).toHaveLength(0);
  });

  it("DM failure revokes token and removes pending connection", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await store.update((state) => addOAuthState(state, oauthState("oauth", "admin")));
    const revoke = vi.fn(async () => undefined);
    const ctx = context(dir, store, fakeApi({
      exchangeCode: async () => tokenResponse("access-secret", "refresh-secret"),
      userInfo: async () => ({ openId: "open-1", displayName: "Creator" }),
      revokeToken: revoke
    }));

    const result = await handleTikTokOAuthCallback(ctx, { code: "code-secret", state: "oauth", sendDm: async () => { throw new Error("dm closed"); }, now: new Date("2026-08-15T00:01:00.000Z") });
    const data = await store.read();

    expect(result.status).toBe(200);
    expect(revoke).toHaveBeenCalledWith("access-secret");
    expect(data.pendingConnections).toHaveLength(0);
    expect(data.connection).toBeNull();
  });

  it("confirming pending connection creates baseline without publishing history", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await store.update((state) => upsertPendingConnection(state, pendingConnection("pending", "admin")));
    const guild = fakeGuildForAdmin("admin");
    const ctx = context(dir, store, fakeApi({
      listVideos: async () => ({ videos: [video("old-1"), video("old-2")], hasMore: false })
    }));

    const message = await confirmTikTokPendingConnection(ctx, { pendingState: "pending", discordUserId: "admin", guild: guild as any, now: new Date("2026-08-15T00:00:00.000Z") });
    const data = await store.read();

    expect(message).toContain("baseline");
    expect(data.connection?.lastVideoId).toBe("old-1");
    expect(data.publishedVideos.map((entry) => entry.videoId).sort()).toEqual(["old-1", "old-2"]);
  });

  it("different Discord user cannot confirm pending connection", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await store.update((state) => upsertPendingConnection(state, pendingConnection("pending", "admin")));

    await expect(confirmTikTokPendingConnection(context(dir, store), {
      pendingState: "pending",
      discordUserId: "other",
      guild: fakeGuildForAdmin("other") as any
    })).rejects.toThrow(/otro usuario/);
  });

  it("admin who lost permissions cannot confirm pending connection", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await store.update((state) => upsertPendingConnection(state, pendingConnection("pending", "admin")));

    await expect(confirmTikTokPendingConnection(context(dir, store), {
      pendingState: "pending",
      discordUserId: "admin",
      guild: fakeGuildForRoles([]) as any
    })).rejects.toThrow(/permisos/);
  });
});

describe("tiktok polling, dedupe and republication", () => {
  it("polling publishes only new videos and dedupes persisted records", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await seedConnection(store);
    await store.update((state) => markVideoPublished(state, "open-1", video("known")));
    const sent: string[] = [];
    const ctx = context(dir, store, fakeApi({
      listVideos: async () => ({ videos: [video("known"), video("new")], hasMore: false })
    }));

    const count = await runTikTokPollingOnce(ctx, fakeGuildWithGeneral(sent) as any, new Date("2026-08-15T00:00:00.000Z"));
    const data = await store.read();

    expect(count).toBe(1);
    expect(sent).toHaveLength(1);
    expect(hasPublishedVideo(data, "open-1", "new")).toBe(true);
  });

  it("does not mark a video as published when Discord send fails", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await seedConnection(store);
    const ctx = context(dir, store, fakeApi({
      listVideos: async () => ({ videos: [video("new")], hasMore: false })
    }));

    await expect(runTikTokPollingOnce(ctx, fakeGuildWithGeneral([], true) as any)).rejects.toThrow(/send failed/);
    expect(hasPublishedVideo(await store.read(), "open-1", "new")).toBe(false);
  });

  it("refresh token uses refresh endpoint data and stores rotated refresh token", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await seedConnection(store, new Date(Date.now() + 1000).toISOString());
    const refresh = vi.fn(async () => tokenResponse("new-access", "new-refresh"));

    const result = await ensureFreshTikTokAccessToken(context(dir, store, fakeApi({ refreshToken: refresh })), (await store.read()).connection!);
    const data = await store.read();

    expect(result.accessToken).toBe("new-access");
    expect(refresh).toHaveBeenCalled();
    expect(decryptToken(data.connection!.encryptedRefreshToken, parseTikTokEncryptionKey(keyBase64()))).toBe("new-refresh");
  });

  it("manual test publishes latest video and marks it to avoid automatic duplicate", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await seedConnection(store);
    const sent: string[] = [];
    await publishTikTokManualVideo(context(dir, store), fakeGuildWithGeneral(sent) as any, video("latest"), "test");

    expect(sent[0]).toContain("TikTok prueba manual");
    expect(hasPublishedVideo(await store.read(), "open-1", "latest")).toBe(true);
  });

  it("manual republication can publish an already published video without changing dedupe or polling state", async () => {
    const dir = await tempDir();
    const store = new TikTokStore(dir);
    await seedConnection(store);
    await store.update((state) => {
      markVideoPublished(state, "open-1", video("old"));
      if (state.connection) {
        state.connection.lastVideoId = "old";
        state.connection.lastCheckAt = "before-check";
        state.connection.lastSuccessAt = "before-success";
      }
    });
    const before = await store.read();
    const sent: string[] = [];

    await publishTikTokManualVideo(context(dir, store), fakeGuildWithGeneral(sent) as any, video("old"), "repost");
    const after = await store.read();

    expect(sent[0]).toContain("TikTok republicado");
    expect(after.publishedVideos).toEqual(before.publishedVideos);
    expect(after.connection?.lastVideoId).toBe("old");
    expect(after.connection?.lastCheckAt).toBe("before-check");
    expect(after.connection?.lastSuccessAt).toBe("before-success");
  });

  it("republish session caches page 2 and selects from current page without reloading page 1", () => {
    const session = createTikTokRepublishSession({
      discordGuildId: "guild",
      discordUserId: "admin",
      openId: "open-1",
      displayName: "Creator",
      firstPage: { videos: [video("video-1")], cursor: 1643332803000, hasMore: true }
    });
    saveTikTokRepublishPage(session, { videos: [video("video-2")], hasMore: false });

    expect(currentTikTokRepublishPage(session).videos[0]?.id).toBe("video-2");
    expect(currentTikTokRepublishPage(session).videos.find((item) => item.id === "video-2")?.shareUrl).toContain("video-2");
  });

  it("previous page uses cached data", () => {
    const session = createTikTokRepublishSession({
      discordGuildId: "guild",
      discordUserId: "admin",
      openId: "open-1",
      displayName: "Creator",
      firstPage: { videos: [video("video-1")], cursor: 1643332803000, hasMore: true }
    });
    saveTikTokRepublishPage(session, { videos: [video("video-2")], hasMore: false });
    moveTikTokRepublishPage(session, "prev");

    expect(currentTikTokRepublishPage(session).videos[0]?.id).toBe("video-1");
  });
});

describe("tiktok Discord safety", () => {
  it("defines /tiktok as administrator command", () => {
    const command = slashCommandDefinitions().find((item) => item.name === "tiktok");

    expect(command).toBeTruthy();
    expect(commandAccessLevel("tiktok")).toBe("administrator");
    expect(command?.options?.map((option) => option.name)).toEqual(expect.arrayContaining(["conectar", "estado", "activar", "desactivar", "desconectar", "prueba", "republicar"]));
  });

  it("formats mention settings with safe allowedMentions", () => {
    expect(buildTikTokDiscordPayload({ displayName: "Creator", video: video("v"), kind: "auto", mention: "ninguna" }).allowedMentions).toEqual({ parse: [] });
    expect(buildTikTokDiscordPayload({ displayName: "Creator", video: video("v"), kind: "auto", mention: "everyone" }).content).toBe("@everyone");
    expect(buildTikTokDiscordPayload({ displayName: "Creator", video: video("v"), kind: "auto", mention: "here" }).content).toBe("@here");
  });

  it("validates GENERAL_CHAT_CHANNEL_ID as compatible destination", async () => {
    const errors = await validateTikTokDestination({
      channels: { fetch: async () => null }
    } as any, {} as any, botEnv());

    expect(errors[0]).toContain("GENERAL_CHAT_CHANNEL_ID");
  });

  it("sanitizes tokens, client secret, authorization code and state", () => {
    process.env.TIKTOK_CLIENT_SECRET = "client-secret";
    process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = "encryption-key";
    const text = sanitizeTikTokText("access_token=abc refresh_token=def client-secret code=ghi state=jkl encryption-key", botEnv(), tiktokEnv());

    expect(text).not.toContain("abc");
    expect(text).not.toContain("def");
    expect(text).not.toContain("client-secret");
    expect(text).not.toContain("ghi");
    expect(text).not.toContain("jkl");
    expect(text).not.toContain("encryption-key");
  });
});

describe("tiktok interaction routing", () => {
  it("responds disabled for /tiktok conectar without requiring credentials", async () => {
    const dir = await tempDir();
    process.env.TIKTOK_ALERTS_ENABLED = "false";
    const interaction = fakeCommandInteraction("conectar");

    await expect(handleTikTokCommand(interaction as any, botEnv(), dir)).resolves.toBeUndefined();

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("desactivado"),
      flags: 64
    }));
  });

  it("does not activate or deactivate without a connection", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    const interaction = fakeCommandInteraction("activar");

    await handleTikTokCommand(interaction as any, botEnv(), dir);

    expect(interaction.reply).toHaveBeenCalledWith({ content: "No hay una cuenta TikTok conectada.", flags: 64 });
  });

  it("blocks a second /tiktok conectar while a pending connection is active", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    const store = new TikTokStore(dir);
    await store.update((state) => upsertPendingConnection(state, pendingConnection("pending", "admin")));
    const interaction = fakeCommandInteraction("conectar", "admin");

    await handleTikTokCommand(interaction as any, botEnv(), dir);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("pendiente de confirmacion"),
      flags: 64
    }));
  });

  it("confirms TikTok from DM with guildId null and validates Admin in DISCORD_GUILD_ID", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    const store = new TikTokStore(dir);
    await store.update((state) => upsertPendingConnection(state, pendingConnection("pending", "admin")));
    mockVideoListFetch([{ videos: [video("baseline")], hasMore: false }]);
    const interaction = fakeDmButtonInteraction(`${tiktokPendingConfirmPrefix}pending`, "admin", fakeGuildForAdmin("admin"));

    await handleTikTokPendingDmButton(interaction as any, botEnv(), dir);
    const data = await store.read();

    expect(interaction.guildId).toBeNull();
    expect(data.connection?.openId).toBe("open-1");
    expect(data.publishedVideos.map((entry) => entry.videoId)).toContain("baseline");
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Cuenta TikTok conectada") }));
  });

  it("does not confirm DM pending for a different Discord user", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    const store = new TikTokStore(dir);
    await store.update((state) => upsertPendingConnection(state, pendingConnection("pending", "admin")));
    const interaction = fakeDmButtonInteraction(`${tiktokPendingConfirmPrefix}pending`, "other", fakeGuildForAdmin("other"));

    await handleTikTokPendingDmButton(interaction as any, botEnv(), dir);
    const data = await store.read();

    expect(data.connection).toBeNull();
    expect(findActivePendingConnectionForUser(data, "admin")).toBeTruthy();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "No se pudo consultar TikTok en este momento." }));
  });

  it("does not confirm DM pending when the user lost Admin permission", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    const store = new TikTokStore(dir);
    await store.update((state) => upsertPendingConnection(state, pendingConnection("pending", "admin")));
    const interaction = fakeDmButtonInteraction(`${tiktokPendingConfirmPrefix}pending`, "admin", fakeGuildForRoles([]));

    await handleTikTokPendingDmButton(interaction as any, botEnv(), dir);

    expect((await store.read()).connection).toBeNull();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "No se pudo consultar TikTok en este momento." }));
  });

  it("cleans expired pending connections with revoke", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    const store = new TikTokStore(dir);
    const expired = pendingConnection("expired", "admin");
    expired.expiresAt = "2026-08-15T00:00:00.000Z";
    await store.update((state) => upsertPendingConnection(state, expired));
    const revoke = vi.fn(async () => undefined);

    const count = await cleanupTikTokExpiredArtifacts(context(dir, store, fakeApi({ revokeToken: revoke })), new Date("2026-08-15T00:01:00.000Z"));

    expect(count).toBe(1);
    expect(revoke).toHaveBeenCalledWith("access");
    expect((await store.read()).pendingConnections).toHaveLength(0);
  });

  it("replies safely when TikTok API fails after deferReply", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    await seedConnection(new TikTokStore(dir));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("access_token=very-secret network down"));
    const interaction = fakeCommandInteraction("prueba");

    await handleTikTokCommand(interaction as any, botEnv(), dir);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith("No se pudo publicar el video TikTok.");
  });

  it("loads page 2 through the real component handler and republishes video-page-2 without changing dedupe", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    const store = new TikTokStore(dir);
    await seedConnection(store);
    await store.update((state) => {
      markVideoPublished(state, "open-1", video("published"));
      if (state.connection) {
        state.connection.lastVideoId = "published";
        state.connection.lastCheckAt = "before-check";
        state.connection.lastSuccessAt = "before-success";
      }
    });
    const fetchSpy = mockVideoListFetch([
      { videos: [video("video-page-1")], cursor: 1643332803000, hasMore: true },
      { videos: [video("video-page-2")], hasMore: false }
    ]);
    const sent: string[] = [];
    const guild = fakeGuildWithGeneral(sent);
    const command = fakeCommandInteraction("republicar", "admin", guild);

    await handleTikTokCommand(command as any, botEnv(), dir);
    const nextId = componentCustomId(command.editReply.mock.calls.at(-1)?.[0], 1, 1);
    const next = fakeButtonInteraction(nextId, "admin", guild);
    await handleTikTokGuildComponent(next as any, botEnv(), dir);

    const selectId = next.editReply.mock.calls.at(-1)?.[0].components[0].toJSON().components[0].custom_id;
    const select = fakeSelectInteraction(selectId, "video-page-2", "admin", guild);
    const before = await store.read();
    await handleTikTokGuildComponent(select as any, botEnv(), dir);
    const after = await store.read();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("video-page-2");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(after.publishedVideos).toEqual(before.publishedVideos);
    expect(after.connection?.lastVideoId).toBe("published");
    expect(after.connection?.lastCheckAt).toBe("before-check");
    expect(after.connection?.lastSuccessAt).toBe("before-success");
  });

  it("does not save an empty next page or build an empty menu", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    await seedConnection(new TikTokStore(dir));
    mockVideoListFetch([
      { videos: [video("video-page-1")], cursor: 1643332803000, hasMore: true },
      { videos: [], hasMore: false }
    ]);
    const guild = fakeGuildWithGeneral([]);
    const command = fakeCommandInteraction("republicar", "admin", guild);
    await handleTikTokCommand(command as any, botEnv(), dir);
    const next = fakeButtonInteraction(componentCustomId(command.editReply.mock.calls.at(-1)?.[0], 1, 1), "admin", guild);

    await handleTikTokGuildComponent(next as any, botEnv(), dir);

    expect(next.followUp).toHaveBeenCalledWith({ content: "No hay mas videos disponibles para republicar.", flags: 64 });
    expect(next.editReply).not.toHaveBeenCalled();
  });

  it("rejects republish selection if the connected TikTok account changed", async () => {
    const dir = await tempDir();
    setTikTokEnabledEnv();
    const store = new TikTokStore(dir);
    await seedConnection(store);
    mockVideoListFetch([{ videos: [video("video-page-1")], hasMore: false }]);
    const sent: string[] = [];
    const guild = fakeGuildWithGeneral(sent);
    const command = fakeCommandInteraction("republicar", "admin", guild);
    await handleTikTokCommand(command as any, botEnv(), dir);
    const selectId = command.editReply.mock.calls.at(-1)?.[0].components[0].toJSON().components[0].custom_id;
    await store.update((state) => {
      if (state.connection) {
        state.connection.openId = "open-2";
        state.connection.displayName = "Other Creator";
      }
    });
    const select = fakeSelectInteraction(selectId, "video-page-1", "admin", guild);

    await handleTikTokGuildComponent(select as any, botEnv(), dir);

    expect(sent).toHaveLength(0);
    expect(select.reply).toHaveBeenCalledWith({ content: "La cuenta TikTok conectada cambio. Ejecuta /tiktok republicar nuevamente.", flags: 64 });
  });
});

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "palworld-tiktok-"));
}

function keyBase64(): string {
  return Buffer.alloc(32, 7).toString("base64");
}

function tiktokEnv(): TikTokEnv {
  return {
    enabled: true,
    clientKey: "client-key",
    clientSecret: "client-secret",
    redirectUri: "https://example.test/tiktok/callback",
    callbackHost: "127.0.0.1",
    callbackPort: 8788,
    tokenEncryptionKey: parseTikTokEncryptionKey(keyBase64()),
    pollingIntervalSeconds: 300,
    mention: "ninguna"
  };
}

function botEnv(): BotEnv {
  return {
    DISCORD_BOT_TOKEN: "discord-secret",
    DISCORD_GUILD_ID: "guild",
    WELCOME_CHANNEL_ID: "welcome",
    RULES_CHANNEL_ID: "rules",
    ROLES_CHANNEL_ID: "roles",
    GENERAL_CHAT_CHANNEL_ID: "general",
    MEMBER_ROLE_ID: "member",
    MEMBER_LOG_CHANNEL_ID: "log"
  };
}

function setTikTokEnabledEnv(): void {
  process.env.TIKTOK_ALERTS_ENABLED = "true";
  process.env.TIKTOK_CLIENT_KEY = "client-key";
  process.env.TIKTOK_CLIENT_SECRET = "client-secret";
  process.env.TIKTOK_REDIRECT_URI = "https://example.test/tiktok/callback";
  process.env.TIKTOK_CALLBACK_HOST = "127.0.0.1";
  process.env.TIKTOK_CALLBACK_PORT = "8788";
  process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = keyBase64();
  process.env.TIKTOK_POLLING_INTERVAL_SECONDS = "300";
  process.env.TIKTOK_MENTION = "ninguna";
}

function context(dir: string, store = new TikTokStore(dir), api = fakeApi()) {
  return { rootDir: dir, env: botEnv(), tiktokEnv: tiktokEnv(), store, api: api as any };
}

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    buildAuthorizeUrl: (state: string) => new TikTokApiClient(tiktokEnv()).buildAuthorizeUrl(state),
    exchangeCode: async () => tokenResponse("access", "refresh"),
    refreshToken: async () => tokenResponse("access-refreshed", "refresh-refreshed"),
    revokeToken: vi.fn(async () => undefined),
    userInfo: async () => ({ openId: "open-1", displayName: "Creator" }),
    listVideos: async () => ({ videos: [], hasMore: false }),
    ...overrides
  };
}

function tokenResponse(accessToken: string, refreshToken: string, scope = "user.info.basic,video.list") {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    refresh_expires_in: 86400,
    open_id: "open-1",
    scope
  };
}

function oauthState(state: string, userId: string) {
  return {
    state,
    discordUserId: userId,
    createdAt: "2026-08-15T00:00:00.000Z",
    expiresAt: "2026-08-15T00:10:00.000Z",
    used: false
  };
}

function pendingConnection(state: string, userId: string): TikTokPendingConnection {
  const key = parseTikTokEncryptionKey(keyBase64());
  return {
    state,
    discordUserId: userId,
    openId: "open-1",
    displayName: "Creator",
    scopes: ["user.info.basic", "video.list"],
    encryptedAccessToken: encryptToken("access", key),
    encryptedRefreshToken: encryptToken("refresh", key),
    accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString()
  };
}

async function seedConnection(store: TikTokStore, accessExpiresAt = new Date(Date.now() + 3600_000).toISOString()): Promise<void> {
  const key = parseTikTokEncryptionKey(keyBase64());
  await store.update((state) => {
    state.connection = {
      openId: "open-1",
      displayName: "Creator",
      scopes: ["user.info.basic", "video.list"],
      encryptedAccessToken: encryptToken("access", key),
      encryptedRefreshToken: encryptToken("refresh", key),
      connectedAt: "2026-08-14T00:00:00.000Z",
      accessTokenExpiresAt: accessExpiresAt,
      refreshTokenExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
      enabled: true
    };
  });
}

function video(id: string): TikTokVideo {
  return {
    id,
    title: `Title ${id}`,
    videoDescription: `Description ${id}`,
    shareUrl: `https://tiktok.test/${id}`,
    coverImageUrl: `https://tiktok.test/${id}.jpg`,
    createTime: 1_800_000_000
  };
}

function fakeGuildWithGeneral(sent: string[], fail = false) {
  const channel = {
    id: "general",
    type: ChannelType.GuildText,
    send: vi.fn(async (payload) => {
      if (fail) {
        throw new Error("send failed");
      }
      sent.push(JSON.stringify(payload));
      return { id: `message-${sent.length}` };
    }),
    permissionsFor: () => ({ has: () => true })
  };
  return {
    id: "guild",
    members: {
      fetch: async () => memberWithRoles(["Admin"])
    },
    channels: {
      fetch: async (id: string) => id === "general" ? channel : null
    }
  };
}

function fakeCommandInteraction(subcommand: string, userId = "admin", guild = fakeGuildWithGeneral([])) {
  const interaction: any = {
    guild,
    guildId: "guild",
    user: { id: userId, bot: false },
    member: memberWithRoles(["Admin"]),
    options: { getSubcommand: () => subcommand },
    replied: false,
    deferred: false,
    reply: vi.fn(async () => {
      interaction.replied = true;
    }),
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply: vi.fn(async () => {
      interaction.replied = true;
    }),
    followUp: vi.fn(async () => undefined)
  };
  return interaction;
}

function fakeDmButtonInteraction(customId: string, userId: string, guild: any) {
  const interaction: any = {
    customId,
    guild: null,
    guildId: null,
    user: { id: userId, bot: false },
    client: {
      guilds: {
        fetch: vi.fn(async (id: string) => {
          expect(id).toBe("guild");
          return guild;
        })
      }
    },
    replied: false,
    deferred: false,
    reply: vi.fn(async () => {
      interaction.replied = true;
    }),
    editReply: vi.fn(async () => {
      interaction.replied = true;
    }),
    followUp: vi.fn(async () => undefined)
  };
  return interaction;
}

function fakeButtonInteraction(customId: string, userId: string, guild: any) {
  const interaction: any = {
    customId,
    guild,
    guildId: "guild",
    user: { id: userId, bot: false },
    member: memberWithRoles(["Admin"]),
    replied: false,
    deferred: false,
    isButton: () => true,
    isStringSelectMenu: () => false,
    reply: vi.fn(async () => {
      interaction.replied = true;
    }),
    update: vi.fn(async () => {
      interaction.replied = true;
    }),
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply: vi.fn(async () => {
      interaction.replied = true;
    }),
    followUp: vi.fn(async () => undefined)
  };
  return interaction;
}

function fakeSelectInteraction(customId: string, value: string, userId: string, guild: any) {
  const interaction: any = {
    customId,
    values: [value],
    guild,
    guildId: "guild",
    user: { id: userId, bot: false },
    member: memberWithRoles(["Admin"]),
    replied: false,
    deferred: false,
    isButton: () => false,
    isStringSelectMenu: () => true,
    reply: vi.fn(async () => {
      interaction.replied = true;
    }),
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply: vi.fn(async () => {
      interaction.replied = true;
    }),
    followUp: vi.fn(async () => undefined)
  };
  return interaction;
}

function componentCustomId(payload: any, rowIndex: number, componentIndex: number): string {
  return payload.components[rowIndex].toJSON().components[componentIndex].custom_id;
}

function fakeGuildForAdmin(userId: string) {
  return fakeGuildForRoles(["Admin"], userId);
}

function fakeGuildForRoles(roleNames: string[], userId = "admin") {
  return {
    id: "guild",
    members: {
      fetch: async (id: string) => {
        if (id !== userId) {
          return memberWithRoles([]);
        }
        return memberWithRoles(roleNames);
      }
    }
  };
}

function memberWithRoles(roleNames: string[]) {
  return {
    roles: {
      cache: {
        some: (predicate: (role: { name: string }) => boolean) => roleNames.some((name) => predicate({ name }))
      }
    }
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function mockVideoListFetch(pages: Array<{ videos: TikTokVideo[]; cursor?: number; hasMore: boolean }>) {
  let index = 0;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (!String(url).startsWith(tiktokVideoListEndpoint)) {
      throw new Error(`Unexpected TikTok API call: ${String(url)}`);
    }
    const page = pages[Math.min(index, pages.length - 1)] ?? { videos: [], hasMore: false };
    index += 1;
    return jsonResponse({
      data: {
        videos: page.videos.map((item) => ({
          id: item.id,
          title: item.title,
          video_description: item.videoDescription,
          share_url: item.shareUrl,
          cover_image_url: item.coverImageUrl,
          create_time: item.createTime
        })),
        cursor: page.cursor,
        has_more: page.hasMore
      }
    });
  });
}
