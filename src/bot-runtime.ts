import {
  ChannelType,
  Client,
  GatewayIntentBits,
  GuildMember,
  Partials,
  TextChannel
} from "discord.js";
import path from "node:path";
import type { BotEnv } from "./bot-config.js";
import { botEnvSecrets } from "./bot-config.js";
import { loadDesiredStructure } from "./config.js";
import { sanitizeSecret } from "./errors.js";
import { buildDirectWelcomeMessage, buildWelcomeEmbed, buildWelcomeMessageInput } from "./bot-message.js";
import { validateBotConfiguration } from "./bot-validation.js";
import { handleSelfRoleInteraction } from "./self-roles-interactions.js";
import { loadSelfRolesConfig } from "./self-roles-config.js";
import { selfRolesConfigPath } from "./self-roles-state.js";
import { validateExistingSelfRoles } from "./self-roles-validation.js";
import { handleBotInteraction } from "./bot-interactions.js";
import { handleInformationChannelMessage, validateInformationPermissionConfiguration } from "./info-permissions.js";
import { loadBreedingCatalog, summarizeBreedingData } from "./breeding-service.js";
import { fetchBreedingChannel } from "./breeding-publisher.js";
import { validateBreedingChannelPermissions } from "./breeding-permissions.js";
import {
  assignPendingRoleIfConfigured,
  handleRulesButtonInteraction,
  isRulesButton,
  publishRulesPanel,
  publishRulesPromptForMember
} from "./rules-acceptance.js";
import { donationsChannelName } from "./donations-panel.js";
import { createTikTokRuntime, validateTikTokStartup, type TikTokRuntime } from "./tiktok-runtime.js";
import { handleTikTokPendingDmButton, isTikTokPendingDmButton } from "./tiktok-interactions.js";

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
const tiktokRuntimes = new WeakMap<Client, TikTokRuntime>();

export function createBotClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
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
  const desired = await loadDesiredStructure(path.join(rootDir, "config", "server-structure.yml"));
  const infoPermissionResult = await validateInformationPermissionConfiguration(guild, botMember, desired);
  const tiktokErrors = await validateTikTokStartup(client, env, rootDir);
  const breedingWarnings: string[] = [];
  await loadBreedingCatalog(rootDir).then((catalog) => {
    const summary = summarizeBreedingData(catalog);
    safeLog(`Crianza cargada: ${summary.palCount} Pals, ${summary.combinationCount} combinaciones.`);
  }).catch((error) => {
    safeError("Crianza deshabilitada temporalmente por error de datos.", error, env);
  });
  if (env.BREEDING_CHANNEL_ID) {
    await fetchBreedingChannel(guild, env).then((channel) => {
      breedingWarnings.push(...validateBreedingChannelPermissions(botMember, channel));
    }).catch((error) => {
      breedingWarnings.push(error instanceof Error ? error.message : String(error));
    });
  }
  const errors = [...result.errors, ...selfRolesResult.errors, ...infoPermissionResult.errors, ...tiktokErrors];
  const warnings = [...result.warnings, ...selfRolesResult.warnings, ...infoPermissionResult.warnings, ...breedingWarnings.map((warning) => `Crianza: ${warning}`)];
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
    const rootDir = options.rootDir ?? process.cwd();
    await validateBotStartup(client, env, rootDir).catch((error) => {
      safeError("Validacion inicial fallida.", error, env);
      process.exitCode = 1;
      void shutdownClient(client);
    });
    if (process.exitCode) {
      return;
    }
    const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID).catch(() => null);
    if (guild) {
      await publishRulesPanel(guild, env, rootDir).then((result) => {
        safeLog(`Panel de reglas ${result.action === "created" ? "publicado" : "actualizado"}: ${result.messageId}.`);
      }).catch((error) => safeError("No se pudo publicar el panel de reglas.", error, env));
    }
    const tiktokRuntime = createTikTokRuntime(client, env, rootDir);
    tiktokRuntimes.set(client, tiktokRuntime);
    await tiktokRuntime.start().catch((error) => safeError("No se pudo iniciar TikTok runtime.", error, env));
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
    if (oldMember.pending === true && newMember.pending === false && !newMember.roles.cache.has(env.MEMBER_ROLE_ID)) {
      await publishRulesPromptForMember(newMember, env, options.rootDir ?? process.cwd()).catch((error) => safeError("Error publicando solicitud de reglas tras verificacion.", error, env));
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton() && isTikTokPendingDmButton(interaction.customId)) {
      await handleTikTokPendingDmButton(interaction, env, options.rootDir ?? process.cwd()).catch((error) => {
        safeError("Error procesando confirmacion TikTok por DM.", error, env);
      });
      return;
    }
    if (interaction.isButton() && isRulesButton(interaction.customId)) {
      await handleRulesButtonInteraction(interaction, env, options.rootDir ?? process.cwd()).catch((error) => {
        safeError("Error procesando aceptacion de reglas.", error, env);
      });
      return;
    }
    if (!interaction.isStringSelectMenu()) {
      await handleBotInteraction(interaction, env, options.rootDir ?? process.cwd()).catch((error) => {
        safeError("Error procesando interaccion.", error, env);
      });
      return;
    }
    const handled = await handleBotInteraction(interaction, env, options.rootDir ?? process.cwd()).catch((error) => {
      safeError("Error procesando interaccion.", error, env);
      return true;
    });
    if (handled) {
      return;
    }
    await handleSelfRoleInteraction(interaction, env, options.rootDir ?? process.cwd()).catch((error) => {
      safeError("Error procesando self-role.", error, env);
    });
  });

  client.on("messageCreate", async (message) => {
    await handleInformationChannelMessage(message, env, options.rootDir ?? process.cwd()).catch((error) => {
      safeError("Error procesando proteccion de canal informativo.", error, env);
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
  const donationsChannelId = await resolveDonationsChannelId(member, env);
  const embed = buildWelcomeEmbed(buildWelcomeMessageInput(
    member,
    env.RULES_CHANNEL_ID,
    env.ROLES_CHANNEL_ID,
    env.GENERAL_CHAT_CHANNEL_ID,
    donationsChannelId
  ));

  await assignPendingRoleIfConfigured(member, env).catch((error) => {
    safeError("No se pudo asignar rol pendiente.", error, env);
  });

  await welcomeChannel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch((error) => {
    safeError("No se pudo enviar bienvenida publica.", error, env);
  });

  if (options.sendDirectWelcome !== false) {
    await member.send(buildDirectWelcomeMessage(env.RULES_CHANNEL_ID, env.ROLES_CHANNEL_ID, env.GENERAL_CHAT_CHANNEL_ID)).catch((error) => {
      safeError("No se pudo enviar mensaje privado de bienvenida.", error, env);
    });
  }

  await publishRulesPromptForMember(member, env, options.rootDir ?? process.cwd()).catch((error) => {
    safeError("No se pudo publicar solicitud de reglas.", error, env);
  });

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

async function resolveDonationsChannelId(member: GuildMember, env: BotEnv): Promise<string | undefined> {
  if (env.DONATIONS_CHANNEL_ID) {
    return env.DONATIONS_CHANNEL_ID;
  }
  const channels = await member.guild.channels.fetch().catch(() => null);
  const channel = channels?.find((candidate) => candidate?.type === ChannelType.GuildText && candidate.name === donationsChannelName);
  return channel?.id;
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
  await tiktokRuntimes.get(client)?.stop().catch((error) => {
    console.error(sanitizeSecret(error, botEnvSecrets()));
  });
  client.destroy();
}

function safeLog(message: string): void {
  console.log(sanitizeSecret(message, botEnvSecrets()));
}

function safeError(message: string, error: unknown, env: BotEnv): void {
  console.error(`${sanitizeSecret(message, botEnvSecrets(env))} ${sanitizeSecret(error, botEnvSecrets(env))}`);
}
