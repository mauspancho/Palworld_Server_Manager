import type { TikTokVideo, TikTokVideoPage } from "./tiktok-types.js";
import { randomTikTokId } from "./tiktok-crypto.js";

export interface TikTokRepublishPage {
  videos: TikTokVideo[];
  cursor?: number;
  hasMore: boolean;
}

export interface TikTokRepublishSession {
  sessionId: string;
  discordGuildId: string;
  discordUserId: string;
  openId: string;
  displayName: string;
  pages: TikTokRepublishPage[];
  currentPageIndex: number;
  expiresAt: number;
}

const ttlMs = 10 * 60 * 1000;
const sessions = new Map<string, TikTokRepublishSession>();

export function createTikTokRepublishSession(input: {
  discordGuildId: string;
  discordUserId: string;
  openId: string;
  displayName: string;
  firstPage: TikTokVideoPage;
  now?: number;
}): TikTokRepublishSession {
  cleanupTikTokRepublishSessions(input.now);
  const session: TikTokRepublishSession = {
    sessionId: randomTikTokId("ttr"),
    discordGuildId: input.discordGuildId,
    discordUserId: input.discordUserId,
    openId: input.openId,
    displayName: input.displayName,
    pages: [input.firstPage],
    currentPageIndex: 0,
    expiresAt: (input.now ?? Date.now()) + ttlMs
  };
  sessions.set(session.sessionId, session);
  return session;
}

export function getTikTokRepublishSession(sessionId: string, now = Date.now()): TikTokRepublishSession | null {
  const session = sessions.get(sessionId) ?? null;
  if (!session) {
    return null;
  }
  if (session.expiresAt <= now) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

export function saveTikTokRepublishPage(session: TikTokRepublishSession, page: TikTokVideoPage): void {
  session.pages.push(page);
  session.currentPageIndex = session.pages.length - 1;
}

export function moveTikTokRepublishPage(session: TikTokRepublishSession, direction: "prev" | "next"): void {
  if (direction === "prev") {
    session.currentPageIndex = Math.max(0, session.currentPageIndex - 1);
  } else {
    session.currentPageIndex = Math.min(session.pages.length - 1, session.currentPageIndex + 1);
  }
}

export function currentTikTokRepublishPage(session: TikTokRepublishSession): TikTokRepublishPage {
  return session.pages[session.currentPageIndex] ?? { videos: [], hasMore: false };
}

export function deleteTikTokRepublishSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function cleanupTikTokRepublishSessions(now = Date.now()): void {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}

export function clearTikTokRepublishSessions(): void {
  sessions.clear();
}
