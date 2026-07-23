import {
  ChannelType,
  Client,
  GatewayIntentBits,
  GuildMember,
  Partials,
  TextChannel
} from "discord.js";
import type { BotEnv } from "./bot-config.js";
import { botEnvSecrets } from "./bot-config.js";
import { sanitizeSecret } from "./errors.js";
import { buildDirectWelcomeMessage, buildWelcomeEmbed, buildWelcomeMessageInput } from "./bot-message.js";
import { validateBotConfiguration } from "./bot-validation.js";
import { handleSelfRoleInteraction } from "./self-roles-interactions.js";
import { loadSelfRolesConfig } from "./self-roles-config.js";
import { selfRolesConfigPath } from "./self-roles-state.js";
import { validateExistingSelfRoles } from "./self-roles-validation.js";

interface ProcessedJoin {
  memberId: string;
  joinedAt: number;
}

export interface BotRuntimeOptions {
  sendDirectWelcome?: boolean;
  rootDir?: string;
}

const processedJoins = new Map<string, ProcessedJoin>();
const processedJoinTtlMs = 10 * 60 * 1000;
const registeredClients = new WeakSet<Client>();

export function createBotClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
  });
}

export async function validateBotStartup(client: Client, env: BotEnv, rootDir = process.cwd()): Promise<void> {
  const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID);
  const botUserId = client.user?.id;
  if (!botUserId) {
    throw new Error("No se pudo identificar el usuario del bot.");
  }
  const botMember = await guild.members.fetch(botUserId);
  const result = await validateBotConfiguration(guild, botMember, env);
  const selfRolesConfig = await loadSelfRolesConfig(selfRolesConfigPath(rootDir));
  const selfRolesResult = await validateExistingSelfRoles(guild, botMember, env, selfRolesConfig);
  const errors = [...result.errors, ...selfRolesResult.errors];
  const warnings = [...result.warnings, ...selfRolesResult.warnings];
  for (const warning of warnings) {
    safeLog(`Advertencia: ${warning}`);
  }
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

export function registerBotHandlers(client: Client, env: BotEnv, options: BotRuntimeOptions = {}): void {
  if (registeredClients.has(client)) {
    return;
  }
  registeredClients.add(client);

  client.once("clientReady", async () => {
    safeLog(`Bot listo como ${client.user?.tag ?? "usuario desconocido"}.`);
    await validateBotStartup(client, env, options.rootDir ?? process.cwd()).catch((error) => {
      safeError("Validacion inicial fallida.", error, env);
      process.exitCode = 1;
      void shutdownClient(client);
    });
  });

  client.on("guildMemberAdd", async (member) => {
    await handleGuildMemberAdd(member, env, options).catch((error) => safeError("Error procesando guildMemberAdd.", error, env));
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (oldMember.guild.id !== env.DISCORD_GUILD_ID || newMember.guild.id !== env.DISCORD_GUILD_ID) {
      return;
    }
    if (newMember.user.bot) {
      return;
    }
    if (oldMember.pending === true && newMember.pending === false) {
      await assignMemberRoleIfAllowed(newMember, env).catch((error) => safeError("Error asignando rol tras verificacion.", error, env));
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu()) {
      return;
    }
    await handleSelfRoleInteraction(interaction, env, options.rootDir ?? process.cwd()).catch((error) => {
      safeError("Error procesando self-role.", error, env);
    });
  });
}

export async function startBot(env: BotEnv, options: BotRuntimeOptions = {}): Promise<Client> {
  const client = createBotClient();
  registerBotHandlers(client, env, options);
  registerShutdown(client);
  await client.login(env.DISCORD_BOT_TOKEN);
  return client;
}

export async function handleGuildMemberAdd(member: GuildMember, env: BotEnv, options: BotRuntimeOptions = {}): Promise<void> {
  if (member.guild.id !== env.DISCORD_GUILD_ID) {
    return;
  }
  if (member.user.bot) {
    return;
  }

  const dedupeKey = `${member.guild.id}:${member.id}:${member.joinedTimestamp ?? Date.now()}`;
  cleanupProcessedJoins();
  if (processedJoins.has(dedupeKey)) {
    return;
  }
  processedJoins.set(dedupeKey, { memberId: member.id, joinedAt: Date.now() });

  const welcomeChannel = await fetchTextChannel(member, env.WELCOME_CHANNEL_ID);
  const logChannel = await fetchTextChannel(member, env.MEMBER_LOG_CHANNEL_ID);
  const embed = buildWelcomeEmbed(buildWelcomeMessageInput(member, env.RULES_CHANNEL_ID, env.ROLES_CHANNEL_ID));

  await welcomeChannel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch((error) => {
    safeError("No se pudo enviar bienvenida publica.", error, env);
  });

  if (options.sendDirectWelcome !== false) {
    await member.send(buildDirectWelcomeMessage(env.RULES_CHANNEL_ID, env.ROLES_CHANNEL_ID)).catch((error) => {
      safeError("No se pudo enviar mensaje privado de bienvenida.", error, env);
    });
  }

  if (member.pending === false) {
    await assignMemberRoleIfAllowed(member, env);
  }

  await logChannel.send({
    content: `Entrada: <@${member.id}> (${member.user.tag}) | pending=${String(member.pending ?? false)} | miembros=${member.guild.memberCount}`
  }).catch((error) => {
    safeError("No se pudo registrar entrada de miembro.", error, env);
  });
}

async function assignMemberRoleIfAllowed(member: GuildMember, env: BotEnv): Promise<void> {
  if (member.guild.id !== env.DISCORD_GUILD_ID || member.user.bot) {
    return;
  }
  if (member.pending === true) {
    return;
  }
  if (member.roles.cache.has(env.MEMBER_ROLE_ID)) {
    return;
  }

  await member.roles.add(env.MEMBER_ROLE_ID, "Miembro verificado o reglas aceptadas").catch((error) => {
    safeError("No se pudo asignar MEMBER_ROLE_ID.", error, env);
  });
}

async function fetchTextChannel(member: GuildMember, channelId: string): Promise<TextChannel> {
  const channel = await member.guild.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(`Canal de texto no disponible: ${channelId}`);
  }
  return channel;
}

function cleanupProcessedJoins(): void {
  const now = Date.now();
  for (const [key, value] of processedJoins) {
    if (now - value.joinedAt > processedJoinTtlMs) {
      processedJoins.delete(key);
    }
  }
}

function registerShutdown(client: Client): void {
  const shutdown = (): void => {
    void shutdownClient(client);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function shutdownClient(client: Client): Promise<void> {
  safeLog("Cerrando bot de forma controlada.");
  client.destroy();
}

function safeLog(message: string): void {
  console.log(sanitizeSecret(message, botEnvSecrets()));
}

function safeError(message: string, error: unknown, env: BotEnv): void {
  console.error(`${sanitizeSecret(message, botEnvSecrets(env))} ${sanitizeSecret(error, botEnvSecrets(env))}`);
}
