import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from "discord.js";
import type { BreedingCatalog, BreedingFilter } from "./breeding-types.js";
import { breedingPageRanges, palsForPage } from "./breeding-service.js";

export const breedingCustomIdPrefix = "breeding:";
export const breedingPageSelectPrefix = `${breedingCustomIdPrefix}page:`;
export const breedingPalSelectPrefix = `${breedingCustomIdPrefix}pal:`;
export const breedingBackPrefix = `${breedingCustomIdPrefix}back:`;
export const breedingCloseId = `${breedingCustomIdPrefix}close`;
export const defaultBreedingFilter: BreedingFilter = "all";
export const defaultBreedingPage = "a-d";

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
  const pals = palsForPage(catalog, filter, pageId);
  return {
    content: pals.length > 0
      ? "Selecciona el Pal que deseas obtener."
      : "No hay Pals disponibles para ese filtro y pagina.",
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
      "Las combinaciones estan clasificadas segun su fuente y estado de verificacion.",
      "",
      "Algunas combinaciones proceden de una fuente anterior a Palworld 1.0 y deben confirmarse antes de iniciar una cadena extensa de crianza."
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
  pageId: string
): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildPageSelect(filter, pageId)),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildPalSelect(catalog, filter, pageId))
  ];
}

export function buildPageSelect(filter: BreedingFilter, selectedPage: string): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(`${breedingPageSelectPrefix}${filter}`)
    .setPlaceholder("Elegir pagina")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(breedingPageRanges.map((page) => ({
      label: page.label,
      value: page.id,
      default: page.id === selectedPage
    })));
}

export function buildPalSelect(catalog: BreedingCatalog, filter: BreedingFilter, pageId: string): StringSelectMenuBuilder {
  const pals = palsForPage(catalog, filter, pageId).slice(0, 25);
  const options = pals.length > 0
    ? pals.map((pal) => ({
        label: pal.name,
        description: pal.categories.slice(0, 2).join(", ").slice(0, 100),
        value: pal.id
      }))
    : [{ label: "Sin resultados", description: "Cambia el filtro o la pagina.", value: "none" }];
  return new StringSelectMenuBuilder()
    .setCustomId(`${breedingPalSelectPrefix}${filter}:${pageId}`)
    .setPlaceholder("Elegir Pal")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(pals.length === 0)
    .addOptions(options);
}

export function parseBreedingFilter(value: string): BreedingFilter {
  return value === "verified" || value === "legacy" ? value : "all";
}
