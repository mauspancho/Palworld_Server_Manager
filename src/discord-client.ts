import {
  Client,
  GatewayIntentBits,
  Guild,
  GuildMember,
  PermissionsBitField
} from "discord.js";
import { SafeError } from "./errors.js";
import type { RuntimeEnv } from "./config.js";

export interface DiscordSession {
  client: Client;
  guild: Guild;
  botMember: GuildMember;
}

export async function connectDiscord(env: RuntimeEnv): Promise<DiscordSession> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  await client.login(env.DISCORD_BOT_TOKEN);
  const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID);
  const botUserId = client.user?.id;
  if (!botUserId) {
    throw new SafeError("No se pudo identificar el usuario del bot.");
  }

  const botMember = await guild.members.fetch(botUserId);
  return { client, guild, botMember };
}

export async function closeDiscord(session: DiscordSession): Promise<void> {
  session.client.destroy();
}

export function validateBotPermissions(botMember: GuildMember): string[] {
  const required = [
    ["ManageChannels", PermissionsBitField.Flags.ManageChannels],
    ["ManageRoles", PermissionsBitField.Flags.ManageRoles],
    ["ViewChannel", PermissionsBitField.Flags.ViewChannel]
  ] as const;

  return required
    .filter(([, permission]) => !botMember.permissions.has(permission))
    .map(([name]) => name);
}
