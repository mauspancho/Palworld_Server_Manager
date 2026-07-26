import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  MessageFlags,
  StringSelectMenuInteraction,
  type ActionRowBuilder,
  type ButtonBuilder,
  type StringSelectMenuBuilder
} from "discord.js";
import type { BotEnv } from "./bot-config.js";
import { botEnvSecrets } from "./bot-config.js";
import { sanitizeSecret } from "./errors.js";
import {
  autocompleteBreedingPals,
  loadBreedingCatalog,
  queryBreedingPal,
  renderBreedingResult
} from "./breeding-service.js";
import {
  breedingBackPrefix,
  breedingBrowsePagePrefix,
  breedingCloseId,
  breedingCustomIdPrefix,
  breedingPageSelectPrefix,
  breedingPalSelectPrefix,
  buildBreedingBrowsePayload,
  buildBreedingResultActions,
  defaultBreedingPage,
  parseBreedingFilter
} from "./breeding-components.js";
import { OperationLogger } from "./logger.js";
import path from "node:path";

const unavailableMessage = "La informacion de crianza no esta disponible temporalmente.";

export async function handleBreedingInteraction(interaction: Interaction, env: BotEnv, rootDir: string): Promise<boolean> {
  if (interaction.isAutocomplete() && interaction.commandName === "crianza") {
    await handleBreedingAutocomplete(interaction, rootDir);
    return true;
  }
  if (interaction.isChatInputCommand() && interaction.commandName === "crianza") {
    await handleBreedingCommand(interaction, env, rootDir).catch((error) => handleBreedingFailure(interaction, env, rootDir, error));
    return true;
  }
  if (interaction.isStringSelectMenu() && isBreedingMenuInteraction(interaction, env)) {
    await handleBreedingSelect(interaction, env, rootDir).catch((error) => handleBreedingFailure(interaction, env, rootDir, error));
    return true;
  }
  if (interaction.isButton() && interaction.customId.startsWith(breedingCustomIdPrefix)) {
    await handleBreedingButton(interaction, env, rootDir).catch((error) => handleBreedingFailure(interaction, env, rootDir, error));
    return true;
  }
  return false;
}

async function handleBreedingAutocomplete(interaction: AutocompleteInteraction, rootDir: string): Promise<void> {
  try {
    const catalog = await loadBreedingCatalog(rootDir);
    const focused = interaction.options.getFocused();
    await interaction.respond(autocompleteBreedingPals(catalog, String(focused), 25));
  } catch {
    await interaction.respond([]);
  }
}

async function handleBreedingCommand(interaction: ChatInputCommandInteraction, env: BotEnv, rootDir: string): Promise<void> {
  await deferEphemeral(interaction);
  if (!(await validateBreedingInteractionLocation(interaction, env))) {
    return;
  }
  const palName = interaction.options.getString("pal", true);
  await replyBreedingResult(interaction, env, rootDir, palName, "all", "command");
}

async function handleBreedingSelect(interaction: StringSelectMenuInteraction, env: BotEnv, rootDir: string): Promise<void> {
  await deferEphemeral(interaction);

  const isPalSelection = interaction.customId.startsWith(breedingPalSelectPrefix);
  if (!(await validateBreedingInteractionLocation(interaction, env))) {
    return;
  }
  if (interaction.user.bot) {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply("Interaccion ignorada.");
    }
    return;
  }

  const catalog = await safeLoadCatalog(interaction, env, rootDir);
  if (!catalog) {
    return;
  }

  if (interaction.customId.startsWith(breedingPageSelectPrefix)) {
    await replyOrUpdateBrowse(interaction, catalog, "all", defaultBreedingPage);
    return;
  }

  if (isPalSelection) {
    const [, , filterValue, pageId] = interaction.customId.split(":");
    const palId = interaction.values[0];
    if (!palId || palId === "none") {
      await interaction.editReply("No hay Pal seleccionado.");
      return;
    }
    const pal = catalog.byId.get(palId);
    if (!pal) {
      await interaction.editReply("Ese Pal ya no existe en el archivo de crianza.");
      return;
    }
    await replyBreedingResult(interaction, env, rootDir, pal.name, parseBreedingFilter(filterValue ?? "all"), "panel", pageId ?? defaultBreedingPage);
    return;
  }

  await interaction.editReply({
    content: "Este panel de crianza esta desactualizado. Usa el panel publicado mas reciente.",
    components: buildBreedingBrowsePayload(catalog, "all", defaultBreedingPage).components
  });
}

async function handleBreedingButton(interaction: ButtonInteraction, env: BotEnv, rootDir: string): Promise<void> {
  await deferButtonUpdate(interaction);

  if (!(await validateBreedingInteractionLocation(interaction, env))) {
    return;
  }
  if (interaction.user.bot) {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply("Interaccion ignorada.");
    }
    return;
  }

  const catalog = await safeLoadCatalog(interaction, env, rootDir);
  if (!catalog) {
    return;
  }

  if (interaction.customId.startsWith(breedingBackPrefix)) {
    const [, , filterValue, pageId] = interaction.customId.split(":");
    await interaction.editReply(buildBreedingBrowsePayload(catalog, parseBreedingFilter(filterValue ?? "all"), pageId ?? defaultBreedingPage));
    return;
  }
  if (interaction.customId.startsWith(breedingBrowsePagePrefix)) {
    const [, , filterValue, pageId] = interaction.customId.split(":");
    await interaction.editReply(buildBreedingBrowsePayload(catalog, parseBreedingFilter(filterValue ?? "all"), pageId ?? defaultBreedingPage));
    return;
  }
  if (interaction.customId === breedingCloseId) {
    await interaction.editReply({ content: "Consulta cerrada.", components: [] });
    return;
  }
  await interaction.editReply("Este boton de crianza esta desactualizado. Usa el panel publicado mas reciente.");
}

async function replyBreedingResult(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  env: BotEnv,
  rootDir: string,
  palName: string,
  filter: "all" | "verified" | "legacy",
  source: "command" | "panel",
  pageId = defaultBreedingPage
): Promise<void> {
  const catalog = await safeLoadCatalog(interaction, env, rootDir);
  if (!catalog) {
    return;
  }
  const result = queryBreedingPal(catalog, palName, filter);
  if (!result) {
    await replyOrEditEphemeral(interaction, `No encontre combinaciones para "${palName}".`);
    return;
  }
  await replyOrEditEphemeral(interaction, {
    content: renderBreedingResult(result, catalog.data.sources),
    components: buildBreedingResultActions(filter, pageId)
  });
  await logBreedingUse(rootDir, env, "Consulta de crianza.", { userId: interaction.user.id, pal: result.pal.name, source, filter });
}

async function validateBreedingInteractionLocation(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ButtonInteraction,
  env: BotEnv
): Promise<boolean> {
  if (!interaction.guild || interaction.guildId !== env.DISCORD_GUILD_ID) {
    await respondToBreedingInteraction(interaction, "Esta interaccion no pertenece al servidor configurado.");
    return false;
  }
  if (!env.BREEDING_CHANNEL_ID) {
    await respondToBreedingInteraction(interaction, "BREEDING_CHANNEL_ID no esta configurado.");
    return false;
  }
  if (interaction.channelId !== env.BREEDING_CHANNEL_ID) {
    await respondToBreedingInteraction(interaction, `Usa esta funcion en <#${env.BREEDING_CHANNEL_ID}>.`);
    return false;
  }
  return true;
}

async function safeLoadCatalog(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ButtonInteraction,
  env: BotEnv,
  rootDir: string
): Promise<Awaited<ReturnType<typeof loadBreedingCatalog>> | null> {
  try {
    return await loadBreedingCatalog(rootDir);
  } catch (error) {
    await logBreedingUse(rootDir, env, "Error cargando datos de crianza.", { error: sanitizeSecret(error, botEnvSecrets(env)) });
    const content = unavailableMessage;
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(content).catch(() => undefined);
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
    return null;
  }
}

async function replyOrUpdateBrowse(
  interaction: StringSelectMenuInteraction,
  catalog: Awaited<ReturnType<typeof loadBreedingCatalog>>,
  filter: "all" | "verified" | "legacy",
  pageId: string
): Promise<void> {
  const payload = buildBreedingBrowsePayload(catalog, filter, pageId);
  await replyOrEditEphemeral(interaction, payload);
}

async function logBreedingUse(rootDir: string, env: BotEnv, message: string, details?: unknown): Promise<void> {
  await new OperationLogger(path.join(rootDir, "logs"), botEnvSecrets(env)).log(message, details).catch(() => undefined);
}

async function replyOrEditEphemeral(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  payload: string | { content: string; components?: Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>> | ReturnType<typeof buildBreedingResultActions> }
): Promise<void> {
  const response = typeof payload === "string" ? { content: payload } : payload;
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply(response);
    return;
  }
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ ...response, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
}

async function deferEphemeral(interaction: ChatInputCommandInteraction | StringSelectMenuInteraction): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
}

async function deferButtonUpdate(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }
}

async function respondToBreedingInteraction(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ButtonInteraction,
  content: string
): Promise<void> {
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply(content);
    return;
  }
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function handleBreedingFailure(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ButtonInteraction,
  env: BotEnv,
  rootDir: string,
  error: unknown
): Promise<void> {
  await logBreedingUse(rootDir, env, "Error procesando interaccion de crianza.", { error: sanitizeSecret(error, botEnvSecrets(env)) });
  await respondToBreedingInteraction(interaction, unavailableMessage).catch(() => undefined);
}

function isBreedingMenuInteraction(interaction: StringSelectMenuInteraction, env: BotEnv): boolean {
  return interaction.customId.startsWith(breedingCustomIdPrefix) || Boolean(env.BREEDING_CHANNEL_ID && interaction.channelId === env.BREEDING_CHANNEL_ID);
}
