import { Client } from "discord.js";
import http, { IncomingMessage, ServerResponse } from "node:http";
import type { BotEnv } from "./bot-config.js";
import type { TikTokEnv } from "./tiktok-types.js";
import { createTikTokServiceContext, handleTikTokOAuthCallback } from "./tiktok-service.js";
import { sanitizeTikTokError } from "./tiktok-sanitize.js";

export interface TikTokCallbackServer {
  close: () => Promise<void>;
}

export function createTikTokCallbackRequestHandler(input: {
  client: Client;
  env: BotEnv;
  tiktokEnv: TikTokEnv;
  rootDir: string;
}) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const host = request.headers.host ?? `${input.tiktokEnv.callbackHost}:${input.tiktokEnv.callbackPort}`;
      const url = new URL(request.url ?? "/", `http://${host}`);
      if (request.method === "GET" && url.pathname === "/health") {
        response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        response.end("OK");
        return;
      }
      if (request.method === "GET" && url.pathname === "/tiktok/callback") {
        const result = await handleTikTokOAuthCallback(createTikTokServiceContext(input.rootDir, input.env, input.tiktokEnv), {
          code: url.searchParams.get("code") ?? undefined,
          state: url.searchParams.get("state") ?? undefined,
          sendDm: async (discordUserId, payload) => {
            const user = await input.client.users.fetch(discordUserId);
            await user.send(payload);
          }
        });
        response.writeHead(result.status, { "content-type": "text/html; charset=utf-8" });
        response.end(result.body);
        return;
      }
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Error interno de TikTok callback.");
      console.error(sanitizeTikTokError(error, input.env, input.tiktokEnv));
    }
  };
}

export async function startTikTokCallbackServer(input: {
  client: Client;
  env: BotEnv;
  tiktokEnv: TikTokEnv;
  rootDir: string;
}): Promise<TikTokCallbackServer> {
  const server = http.createServer((request, response) => {
    void createTikTokCallbackRequestHandler(input)(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.tiktokEnv.callbackPort, input.tiktokEnv.callbackHost, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}
