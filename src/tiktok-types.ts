export const tiktokSchemaVersion = 1;

export const requiredTikTokScopes = ["user.info.basic", "video.list"] as const;

export type TikTokMention = "ninguna" | "everyone" | "here";

export interface TikTokEnv {
  enabled: boolean;
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  callbackHost: string;
  callbackPort: number;
  tokenEncryptionKey: Buffer<ArrayBufferLike>;
  pollingIntervalSeconds: number;
  mention: TikTokMention;
}

export interface EncryptedToken {
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface TikTokOAuthState {
  state: string;
  discordUserId: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

export interface TikTokPendingConnection {
  state: string;
  discordUserId: string;
  openId: string;
  displayName: string;
  avatarUrl?: string;
  scopes: string[];
  encryptedAccessToken: EncryptedToken;
  encryptedRefreshToken: EncryptedToken;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  expiresAt: string;
}

export interface TikTokConnection {
  openId: string;
  displayName: string;
  avatarUrl?: string;
  scopes: string[];
  encryptedAccessToken: EncryptedToken;
  encryptedRefreshToken: EncryptedToken;
  connectedAt: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  enabled: boolean;
  lastCheckAt?: string;
  lastSuccessAt?: string;
  lastVideoId?: string;
}

export interface TikTokPublishedVideo {
  openId: string;
  videoId: string;
  createTime?: number;
  publishedAt: string;
}

export interface TikTokPollingState {
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastErrorAt?: string;
  lastError?: string;
}

export interface TikTokState {
  schemaVersion: 1;
  connection: TikTokConnection | null;
  oauthStates: TikTokOAuthState[];
  pendingConnections: TikTokPendingConnection[];
  publishedVideos: TikTokPublishedVideo[];
  pollingState: TikTokPollingState;
}

export interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type?: string;
}

export interface TikTokUserInfo {
  openId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface TikTokVideo {
  id: string;
  title?: string;
  videoDescription?: string;
  shareUrl: string;
  coverImageUrl?: string;
  createTime?: number;
}

export interface TikTokVideoPage {
  videos: TikTokVideo[];
  cursor?: number;
  hasMore: boolean;
}

export type TikTokPublishKind = "auto" | "test" | "repost";
