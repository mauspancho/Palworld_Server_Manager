import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from "discord.js";
import type { BreedingCatalog, BreedingFilter, BreedingPalRecord } from "./breeding-types.js";
import { filterPals } from "./breeding-service.js";

export const breedingCustomIdPrefix = "breeding:";
export const breedingPageSelectPrefix = `${breedingCustomIdPrefix}page:`;
export const breedingPalSelectPrefix = `${breedingCustomIdPrefix}pal:`;
export const breedingBackPrefix = `${breedingCustomIdPrefix}back:`;
export const breedingCloseId = `${breedingCustomIdPrefix}close`;
export const defaultBreedingFilter: BreedingFilter = "all";
export const defaultBreedingPage = "a-d";
const maxSelectOptions = 25;

export function buildBreedingPanelPayload(catalog: BreedingCatalog): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
} {
  return {
    embeds: [buildBreedingPanelEmbed(catalog)],
    components: buildBreedingBrowseComponents(catalog, defaultBreedingFilter, defaultBreedingPage)
  };
}

export function buildBreedingBrowsePayload(catalog: BreedingCatalog, filter: BreedingFilter, pageId: string): {
  content: string;
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
} {
  const pals = filterPals(catalog, filter);
  return {
    content: pals.length > 0
      ? "Selecciona el Pal que deseas obtener."
      : "No hay Pals disponibles.",
    components: buildBreedingBrowseComponents(catalog, filter, pageId)
  };
}

export function buildBreedingResultActions(filter: BreedingFilter, pageId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${breedingBackPrefix}${filter}:${pageId}`)
        .setLabel("Volver a la lista")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(breedingCloseId)
        .setLabel("Cerrar")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

export function buildBreedingPanelEmbed(catalog: BreedingCatalog): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🥚 Combinaciones de crianza de Palworld")
    .setDescription([
      "Selecciona el Pal que deseas obtener para consultar todas las combinaciones disponibles.",
      "",
      "La lista completa esta repartida en varios menus porque Discord limita cada desplegable a 25 opciones.",
      "",
      "Algunas combinaciones deben confirmarse antes de iniciar una cadena extensa de crianza."
    ].join("\n"))
    .addFields(
      { name: "Pals disponibles", value: String(catalog.pals.length), inline: true },
      { name: "Combinaciones", value: String(catalog.pals.reduce((total, pal) => total + pal.combinations.length, 0)), inline: true }
    )
    .setColor(0x62b6cb);
}

export function buildBreedingBrowseComponents(
  catalog: BreedingCatalog,
  filter: BreedingFilter,
  _pageId: string
): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  return chunkPals(filterPals(catalog, filter), maxSelectOptions)
    .slice(0, 5)
    .map((pals, index) => new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildPalSelect(pals, filter, index)));
}

export function buildPalSelect(pals: BreedingPalRecord[], filter: BreedingFilter, index: number): StringSelectMenuBuilder {
  const options = pals.length > 0
    ? pals.map((pal) => ({
        label: pal.name,
        description: pal.categories.slice(0, 2).join(", ").slice(0, 100),
        value: pal.id
      }))
    : [{ label: "Sin resultados", description: "Cambia el filtro o la pagina.", value: "none" }];
  return new StringSelectMenuBuilder()
    .setCustomId(`${breedingPalSelectPrefix}${filter}:${index}`)
    .setPlaceholder(`Elegir Pal ${index + 1}`)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(pals.length === 0)
    .addOptions(options);
}

export function parseBreedingFilter(value: string): BreedingFilter {
  return value === "verified" || value === "legacy" ? value : "all";
}

function chunkPals(pals: BreedingPalRecord[], size: number): BreedingPalRecord[][] {
  const chunks: BreedingPalRecord[][] = [];
  for (let index = 0; index < pals.length; index += size) {
    chunks.push(pals.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}
