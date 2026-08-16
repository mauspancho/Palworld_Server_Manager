import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import type {
  TikTokConnection,
  TikTokOAuthState,
  TikTokPendingConnection,
  TikTokPublishedVideo,
  TikTokState,
  TikTokVideo
} from "./tiktok-types.js";
import { tiktokSchemaVersion } from "./tiktok-types.js";

const writeQueues = new Map<string, Promise<unknown>>();

export function tiktokStatePath(rootDir: string): string {
  return path.join(rootDir, "data", "tiktok-state.json");
}

export function emptyTikTokState(): TikTokState {
  return {
    schemaVersion: tiktokSchemaVersion,
    connection: null,
    oauthStates: [],
    pendingConnections: [],
    publishedVideos: [],
    pollingState: {}
  };
}

export class TikTokStore {
  private readonly filePath: string;

  constructor(private readonly rootDir: string) {
    this.filePath = tiktokStatePath(rootDir);
  }

  async read(): Promise<TikTokState> {
    return normalizeTikTokState(await readJsonFile<TikTokState>(this.filePath, emptyTikTokState()));
  }

  async write(state: TikTokState): Promise<void> {
    await writeJsonAtomic(this.filePath, normalizeTikTokState(state));
  }

  async update<T>(mutator: (state: TikTokState) => T | Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const state = await this.read();
      const result = await mutator(state);
      await this.write(state);
      return result;
    };
    const queue = writeQueues.get(this.filePath) ?? Promise.resolve();
    const next = queue.then(run, run);
    writeQueues.set(this.filePath, next.catch(() => undefined));
    return next;
  }
}

export function normalizeTikTokState(value: Partial<TikTokState> | null | undefined): TikTokState {
  return {
    schemaVersion: tiktokSchemaVersion,
    connection: value?.connection ?? null,
    oauthStates: value?.oauthStates ?? [],
    pendingConnections: value?.pendingConnections ?? [],
    publishedVideos: value?.publishedVideos ?? [],
    pollingState: value?.pollingState ?? {}
  };
}

export function pruneExpiredOAuthEntries(state: TikTokState, now = new Date()): void {
  state.oauthStates = state.oauthStates.filter((entry) => !entry.used && new Date(entry.expiresAt).getTime() > now.getTime());
}

export function addOAuthState(state: TikTokState, entry: TikTokOAuthState): void {
  pruneExpiredOAuthEntries(state);
  state.oauthStates.push(entry);
}

export function consumeOAuthState(state: TikTokState, oauthState: string, now = new Date()): TikTokOAuthState | null {
  const entry = state.oauthStates.find((candidate) => candidate.state === oauthState);
  if (!entry || entry.used || new Date(entry.expiresAt).getTime() <= now.getTime()) {
    return null;
  }
  entry.used = true;
  return entry;
}

export function upsertPendingConnection(state: TikTokState, pending: TikTokPendingConnection): void {
  state.pendingConnections = state.pendingConnections.filter((entry) => entry.state !== pending.state && entry.discordUserId !== pending.discordUserId);
  state.pendingConnections.push(pending);
}

export function findPendingConnection(state: TikTokState, pendingState: string): TikTokPendingConnection | null {
  return state.pendingConnections.find((entry) => entry.state === pendingState) ?? null;
}

export function findActivePendingConnectionForUser(
  state: TikTokState,
  discordUserId: string,
  now = new Date()
): TikTokPendingConnection | null {
  return state.pendingConnections.find((entry) => entry.discordUserId === discordUserId && new Date(entry.expiresAt).getTime() > now.getTime()) ?? null;
}

export function takeExpiredPendingConnections(state: TikTokState, now = new Date()): TikTokPendingConnection[] {
  const expired = state.pendingConnections.filter((entry) => new Date(entry.expiresAt).getTime() <= now.getTime());
  if (expired.length > 0) {
    state.pendingConnections = state.pendingConnections.filter((entry) => new Date(entry.expiresAt).getTime() > now.getTime());
  }
  return expired;
}

export function takePendingConnection(state: TikTokState, pendingState: string): TikTokPendingConnection | null {
  const pending = state.pendingConnections.find((entry) => entry.state === pendingState) ?? null;
  state.pendingConnections = state.pendingConnections.filter((entry) => entry.state !== pendingState);
  return pending;
}

export function removePendingConnection(state: TikTokState, pendingState: string): void {
  state.pendingConnections = state.pendingConnections.filter((entry) => entry.state !== pendingState);
}

export function saveConnection(state: TikTokState, connection: TikTokConnection): void {
  state.connection = connection;
}

export function clearConnection(state: TikTokState): TikTokConnection | null {
  const previous = state.connection;
  state.connection = null;
  state.pendingConnections = [];
  return previous;
}

export function hasPublishedVideo(state: TikTokState, openId: string, videoId: string): boolean {
  return state.publishedVideos.some((entry) => entry.openId === openId && entry.videoId === videoId);
}

export function markVideoPublished(
  state: TikTokState,
  openId: string,
  video: Pick<TikTokVideo, "id" | "createTime">,
  now = new Date()
): void {
  if (!hasPublishedVideo(state, openId, video.id)) {
    state.publishedVideos.push({
      openId,
      videoId: video.id,
      createTime: video.createTime,
      publishedAt: now.toISOString()
    });
  }
}

export function markVideosPublished(
  state: TikTokState,
  openId: string,
  videos: Array<Pick<TikTokVideo, "id" | "createTime">>,
  now = new Date()
): void {
  for (const video of videos) {
    markVideoPublished(state, openId, video, now);
  }
}

export function latestVideoId(videos: Array<Pick<TikTokVideo, "id" | "createTime">>): string | undefined {
  return [...videos].sort((left, right) => (right.createTime ?? 0) - (left.createTime ?? 0))[0]?.id;
}

export function clonePublishedVideos(videos: TikTokPublishedVideo[]): TikTokPublishedVideo[] {
  return videos.map((video) => ({ ...video }));
}
