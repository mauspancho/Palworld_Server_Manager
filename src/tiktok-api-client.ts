import { SafeError } from "./errors.js";
import type { TikTokEnv } from "./tiktok-types.js";
import type { TikTokTokenResponse, TikTokUserInfo, TikTokVideoPage } from "./tiktok-types.js";

export const tiktokAuthorizeEndpoint = "https://www.tiktok.com/v2/auth/authorize/";
export const tiktokTokenEndpoint = "https://open.tiktokapis.com/v2/oauth/token/";
export const tiktokUserInfoEndpoint = "https://open.tiktokapis.com/v2/user/info/";
export const tiktokVideoListEndpoint = "https://open.tiktokapis.com/v2/video/list/";
export const tiktokRevokeEndpoint = "https://open.tiktokapis.com/v2/oauth/revoke/";

export interface TikTokFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class TikTokApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly env: Pick<TikTokEnv, "clientKey" | "clientSecret" | "redirectUri">,
    options: TikTokFetchOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  buildAuthorizeUrl(state: string): string {
    const url = new URL(tiktokAuthorizeEndpoint);
    url.searchParams.set("client_key", this.env.clientKey);
    url.searchParams.set("scope", "user.info.basic,video.list");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", this.env.redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<TikTokTokenResponse> {
    const body = new URLSearchParams({
      client_key: this.env.clientKey,
      client_secret: this.env.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: this.env.redirectUri
    });
    return this.postForm<TikTokTokenResponse>(tiktokTokenEndpoint, body);
  }

  async refreshToken(refreshToken: string): Promise<TikTokTokenResponse> {
    const body = new URLSearchParams({
      client_key: this.env.clientKey,
      client_secret: this.env.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
    return this.postForm<TikTokTokenResponse>(tiktokTokenEndpoint, body);
  }

  async revokeToken(token: string): Promise<void> {
    const body = new URLSearchParams({
      client_key: this.env.clientKey,
      client_secret: this.env.clientSecret,
      token
    });
    await this.postForm<unknown>(tiktokRevokeEndpoint, body);
  }

  async userInfo(accessToken: string): Promise<TikTokUserInfo> {
    const url = new URL(tiktokUserInfoEndpoint);
    url.searchParams.set("fields", "open_id,display_name,avatar_url");
    const payload = await this.getJson<TikTokUserInfoResponse>(url.toString(), accessToken);
    const user = payload.data?.user;
    if (!user?.open_id || !user.display_name) {
      throw new SafeError("TikTok no devolvio informacion de usuario suficiente.");
    }
    return {
      openId: user.open_id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url || undefined
    };
  }

  async listVideos(accessToken: string, maxCount = 20, cursor?: number): Promise<TikTokVideoPage> {
    const url = new URL(tiktokVideoListEndpoint);
    url.searchParams.set("fields", "id,title,video_description,share_url,cover_image_url,create_time");
    const payload = await this.postJson<TikTokVideoListResponse>(url.toString(), accessToken, {
      max_count: maxCount,
      ...(cursor !== undefined ? { cursor } : {})
    });
    const data = payload.data ?? {};
    return {
      videos: (data.videos ?? []).map((video) => ({
        id: video.id,
        title: video.title || undefined,
        videoDescription: video.video_description || undefined,
        shareUrl: video.share_url,
        coverImageUrl: video.cover_image_url || undefined,
        createTime: video.create_time
      })).filter((video) => Boolean(video.id && video.shareUrl)),
      cursor: data.cursor,
      hasMore: data.has_more === true
    };
  }

  private async postForm<T>(url: string, body: URLSearchParams): Promise<T> {
    const response = await this.request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    return response.json() as Promise<T>;
  }

  private async getJson<T>(url: string, accessToken: string): Promise<T> {
    const response = await this.request(url, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    return response.json() as Promise<T>;
  }

  private async postJson<T>(url: string, accessToken: string, body: unknown): Promise<T> {
    const response = await this.request(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return response.json() as Promise<T>;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new SafeError(`TikTok API respondio HTTP ${response.status}.`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function grantedScopes(scope: string | string[] | undefined): string[] {
  if (Array.isArray(scope)) {
    return scope;
  }
  return (scope ?? "").split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
}

export function hasRequiredScopes(scopes: string[], requiredScopes = ["user.info.basic", "video.list"]): boolean {
  const granted = new Set(scopes);
  return requiredScopes.every((scope) => granted.has(scope));
}

interface TikTokUserInfoResponse {
  data?: {
    user?: {
      open_id?: string;
      display_name?: string;
      avatar_url?: string;
    };
  };
}

interface TikTokVideoListResponse {
  data?: {
    videos?: Array<{
      id: string;
      title?: string;
      video_description?: string;
      share_url: string;
      cover_image_url?: string;
      create_time?: number;
    }>;
    cursor?: number;
    has_more?: boolean;
  };
}
