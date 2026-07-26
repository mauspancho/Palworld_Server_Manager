import fs from "node:fs/promises";
import path from "node:path";
import { SafeError } from "./errors.js";
import type {
  BreedingCatalog,
  BreedingCombination,
  BreedingDataFile,
  BreedingFilter,
  BreedingPalRecord,
  BreedingQueryResult,
  BreedingSourceId,
  BreedingValidationSummary,
  BreedingVerificationStatus
} from "./breeding-types.js";

export const breedingDataFileName = "breeding-combinations.json";
export const breedingPageRanges = [
  { id: "a-d", label: "A-D", from: "a", to: "d" },
  { id: "e-h", label: "E-H", from: "e", to: "h" },
  { id: "i-m", label: "I-M", from: "i", to: "m" },
  { id: "n-r", label: "N-R", from: "n", to: "r" },
  { id: "s-z", label: "S-Z", from: "s", to: "z" }
] as const;

export const breedingFilters: Array<{ id: BreedingFilter; label: string; description: string }> = [
  { id: "all", label: "Todos", description: "Mostrar todas las combinaciones." },
  { id: "verified", label: "Fuente marcada para Palworld 1.0", description: "Combinaciones marcadas para Palworld 1.0." },
  { id: "legacy", label: "Adicionales por verificar", description: "Combinaciones anteriores a Palworld 1.0." }
];

const sourceIds = new Set<BreedingSourceId>(["GAMES_GG", "VANDAL"]);
const statuses = new Set<BreedingVerificationStatus>(["SOURCE_MARKED_1_0", "LEGACY_REQUIRES_1_0_VERIFICATION"]);
const genders = new Set(["MALE", "FEMALE", null]);
const canonicalNameAliases = new Map<string, string>([
  [normalizePalName("Celsdir"), "Celesdir"],
  [normalizePalName("Celsdir Noct"), "Celesdir Noct"],
  [normalizePalName("Celesdir Noct"), "Celesdir Noct"],
  [normalizePalName("Silvergis"), "Silvegis"],
  [normalizePalName("Jetdragon"), "Jetragon"],
  [normalizePalName("Hangy Cryst"), "Hangyu Cryst"],
  [normalizePalName("Ronbiquill Terra"), "Robinquill Terra"],
  [normalizePalName("Dinosoom"), "Dinossom"],
  [normalizePalName("AnubisAnubis"), "Anubis"]
]);

export function breedingDataPath(rootDir: string): string {
  return path.join(rootDir, "config", breedingDataFileName);
}

export async function loadBreedingCatalog(rootDir: string): Promise<BreedingCatalog> {
  return createBreedingCatalog(await readBreedingDataFile(breedingDataPath(rootDir)));
}

export async function readBreedingDataFile(filePath: string): Promise<BreedingDataFile> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new SafeError(`Archivo de crianza inexistente: ${filePath}`);
    }
    throw error;
  }

  try {
    return JSON.parse(raw) as BreedingDataFile;
  } catch {
    throw new SafeError(`JSON de crianza corrupto: ${filePath}`);
  }
}

export function createBreedingCatalog(data: BreedingDataFile): BreedingCatalog {
  const normalized = normalizeBreedingData(data);
  validateBreedingData(normalized);
  const pals = [...normalized.pals].sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(pals.map((pal) => [pal.id, pal]));
  const bySearchKey = new Map<string, BreedingPalRecord>();
  for (const pal of pals) {
    bySearchKey.set(normalizePalName(pal.name), pal);
    for (const alias of pal.aliases) {
      bySearchKey.set(normalizePalName(alias), pal);
    }
  }
  return { data: normalized, pals, byId, bySearchKey };
}

export function normalizePalName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function canonicalPalName(value: string): string {
  return canonicalNameAliases.get(normalizePalName(value)) ?? value.trim().replace(/\s+/g, " ");
}

export function breedingCombinationKey(target: string, combination: Pick<BreedingCombination, "parent1" | "parent2">): string {
  const parents = [combination.parent1, combination.parent2]
    .map((parent) => `${normalizePalName(canonicalPalName(parent.name))}:${parent.gender ?? ""}`)
    .sort();
  return `${normalizePalName(canonicalPalName(target))}|${parents[0]}|${parents[1]}`;
}

export function filterBreedingCombinations(combinations: BreedingCombination[], filter: BreedingFilter): BreedingCombination[] {
  if (filter === "verified") {
    return combinations.filter((combination) => combination.verificationStatus === "SOURCE_MARKED_1_0");
  }
  if (filter === "legacy") {
    return combinations.filter((combination) => combination.verificationStatus === "LEGACY_REQUIRES_1_0_VERIFICATION");
  }
  return combinations;
}

export function filterPals(catalog: BreedingCatalog, filter: BreedingFilter, category?: string): BreedingPalRecord[] {
  return catalog.pals
    .filter((pal) => filterBreedingCombinations(pal.combinations, filter).length > 0)
    .filter((pal) => !category || pal.categories.includes(category));
}

export function palsForPage(catalog: BreedingCatalog, filter: BreedingFilter, pageId: string): BreedingPalRecord[] {
  const page = breedingPageRanges.find((candidate) => candidate.id === pageId) ?? breedingPageRanges[0];
  return filterPals(catalog, filter).filter((pal) => {
    const first = normalizePalName(pal.name).charAt(0);
    return first >= page.from && first <= page.to;
  });
}

export function queryBreedingPal(catalog: BreedingCatalog, input: string, filter: BreedingFilter = "all"): BreedingQueryResult | null {
  const pal = catalog.bySearchKey.get(normalizePalName(input));
  if (!pal) {
    return null;
  }
  return { pal, combinations: filterBreedingCombinations(pal.combinations, filter), filter };
}

export function autocompleteBreedingPals(catalog: BreedingCatalog, input: string, limit = 25): Array<{ name: string; value: string }> {
  const needle = normalizePalName(input);
  return catalog.pals
    .filter((pal) => {
      const names = [pal.name, ...pal.aliases].map(normalizePalName);
      return needle.length === 0 || names.some((name) => name.includes(needle));
    })
    .slice(0, limit)
    .map((pal) => ({ name: pal.name, value: pal.name }));
}

export function renderBreedingResult(result: BreedingQueryResult, sources: BreedingDataFile["sources"]): string {
  const lines = [`🐾 ${result.pal.name}`, ""];
  if (result.pal.categories.length > 0) {
    lines.push(`Categorias: ${result.pal.categories.join(", ")}`, "");
  }
  lines.push(filterTitle(result.filter), "");

  if (result.combinations.length === 0) {
    lines.push("No hay combinaciones registradas para este Pal.");
    return lines.join("\n");
  }

  result.combinations.forEach((combination, index) => {
    lines.push(`${index + 1}. ${formatParent(combination.parent1)} + ${formatParent(combination.parent2)} = ${result.pal.name} (${statusLabel(combination.verificationStatus)})`);
    lines.push(`   Fuente: ${combination.sources.map((source) => sources[source].label).join(", ")}`);
    lines.push(`   Actualizacion: ${formatSourceDates(combination, sources)}`);
  });
  lines.push("", `Total: ${result.combinations.length} combinacion${result.combinations.length === 1 ? "" : "es"}.`);
  lines.push("Nota: el orden de los padres normalmente no importa.");
  if (result.combinations.some((combination) => combination.verificationStatus === "LEGACY_REQUIRES_1_0_VERIFICATION")) {
    lines.push("⚠ Algunas combinaciones proceden de una fuente anterior a Palworld 1.0 y deben confirmarse antes de una cadena extensa.");
  }
  if (result.combinations.some((combination) => combination.parent1.gender || combination.parent2.gender)) {
    lines.push("⚠ El sexo indicado de cada progenitor es obligatorio en las combinaciones marcadas.");
  }
  return trimDiscordContent(lines.join("\n"));
}

export function summarizeBreedingData(catalog: BreedingCatalog): BreedingValidationSummary {
  const combinations = catalog.pals.flatMap((pal) => pal.combinations);
  return {
    palCount: catalog.pals.length,
    combinationCount: combinations.length,
    gamesCombinationCount: combinations.filter((combination) => combination.sources.includes("GAMES_GG")).length,
    vandalAdditionalCombinationCount: combinations.filter((combination) => combination.sources.includes("VANDAL") && !combination.sources.includes("GAMES_GG")).length
  };
}

export function normalizeBreedingData(data: BreedingDataFile): BreedingDataFile {
  const palMap = new Map<string, BreedingPalRecord>();
  const duplicateKeys = new Set<string>();
  for (const pal of data.pals ?? []) {
    const name = canonicalPalName(pal.name);
    const existing = palMap.get(normalizePalName(name)) ?? {
      id: pal.id,
      name,
      categories: [],
      aliases: [],
      combinations: []
    };
    for (const category of pal.categories ?? []) {
      if (!existing.categories.includes(category)) {
        existing.categories.push(category);
      }
    }
    for (const alias of pal.aliases ?? []) {
      if (!existing.aliases.includes(alias) && normalizePalName(alias) !== normalizePalName(existing.name)) {
        existing.aliases.push(alias);
      }
    }
    for (const combination of pal.combinations ?? []) {
      const normalizedCombination = normalizeCombination(existing.name, combination);
      const key = breedingCombinationKey(existing.name, normalizedCombination);
      const duplicate = existing.combinations.find((candidate) => breedingCombinationKey(existing.name, candidate) === key);
      if (duplicate) {
        duplicateKeys.add(key);
        for (const source of normalizedCombination.sources) {
          if (!duplicate.sources.includes(source)) {
            duplicate.sources.push(source);
          }
          duplicate.sourceUpdatedAtBySource ??= {};
          duplicate.sourceUpdatedAtBySource[source] = normalizedCombination.sourceUpdatedAtBySource?.[source] ?? normalizedCombination.sourceUpdatedAt;
        }
        if (duplicate.sources.includes("GAMES_GG")) {
          duplicate.verificationStatus = "SOURCE_MARKED_1_0";
          duplicate.sourceUpdatedAt = data.sources.GAMES_GG.updatedAt;
        }
      } else {
        existing.combinations.push(normalizedCombination);
      }
    }
    palMap.set(normalizePalName(existing.name), existing);
  }

  return {
    ...data,
    pals: [...palMap.values()].map((pal) => ({
      ...pal,
      categories: [...new Set(pal.categories)].sort(),
      aliases: [...new Set(pal.aliases)].sort(),
      combinations: pal.combinations.sort((a, b) => a.parent1.name.localeCompare(b.parent1.name) || a.parent2.name.localeCompare(b.parent2.name))
    })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

export function validateBreedingData(data: BreedingDataFile): void {
  const errors: string[] = [];
  if (data.schemaVersion !== 1) {
    errors.push("schemaVersion debe ser 1.");
  }
  if (!data.sources?.GAMES_GG || !data.sources?.VANDAL) {
    errors.push("Deben existir metadatos para GAMES_GG y VANDAL.");
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  const keys = new Set<string>();
  const combinations = data.pals?.flatMap((pal) => pal.combinations.map((combination) => ({ pal, combination }))) ?? [];

  for (const pal of data.pals ?? []) {
    if (!pal.id || ids.has(pal.id)) {
      errors.push(`ID de Pal duplicado o vacio: ${pal.id || pal.name}`);
    }
    ids.add(pal.id);
    const normalizedName = normalizePalName(pal.name);
    if (!pal.name || names.has(normalizedName)) {
      errors.push(`Nombre de Pal duplicado o vacio: ${pal.name}`);
    }
    names.add(normalizedName);
    if (!Array.isArray(pal.categories) || pal.categories.length === 0) {
      errors.push(`Pal sin categorias: ${pal.name}`);
    }
    if (!Array.isArray(pal.combinations) || pal.combinations.length === 0) {
      errors.push(`Pal sin combinaciones: ${pal.name}`);
    }
    for (const combination of pal.combinations ?? []) {
      const key = breedingCombinationKey(pal.name, combination);
      if (keys.has(key)) {
        errors.push(`Combinacion duplicada: ${pal.name} ${combination.parent1.name} + ${combination.parent2.name} key=${key}`);
      }
      keys.add(key);
      validateCombination(pal.name, combination, errors);
    }
  }

  const summary = {
    palCount: data.pals?.length ?? 0,
    combinationCount: combinations.length,
    gamesCombinationCount: combinations.filter(({ combination }) => combination.sources.includes("GAMES_GG")).length,
    vandalAdditionalCombinationCount: combinations.filter(({ combination }) => combination.sources.includes("VANDAL") && !combination.sources.includes("GAMES_GG")).length
  };
  expectCount(errors, "Pals objetivo", 86, summary.palCount);
  expectCount(errors, "Combinaciones unicas", 113, summary.combinationCount);
  expectCount(errors, "Combinaciones GAMES.GG", 42, summary.gamesCombinationCount);
  expectCount(errors, "Combinaciones adicionales Vandal", 71, summary.vandalAdditionalCombinationCount);

  const ghangler = data.pals.find((pal) => pal.name === "Ghangler Ignis");
  const ghanglerCombination = ghangler?.combinations.find((combination) => breedingCombinationKey(ghangler.name, combination).includes("ghangler ignis"));
  if (!ghanglerCombination || !ghanglerCombination.sources.includes("GAMES_GG") || !ghanglerCombination.sources.includes("VANDAL")) {
    errors.push("Ghangler Ignis debe aparecer una sola vez con fuentes GAMES_GG y VANDAL.");
  }
  const wumpoBotan = data.pals.find((pal) => pal.name === "Wumpo Botan");
  if (wumpoBotan?.combinations.length !== 4) {
    errors.push(`Wumpo Botan debe tener 4 combinaciones. Real=${wumpoBotan?.combinations.length ?? 0}`);
  }
  const jormuntideIgnis = data.pals.find((pal) => pal.name === "Jormuntide Ignis");
  if (jormuntideIgnis?.combinations.length !== 1) {
    errors.push(`Jormuntide Ignis debe tener 1 combinacion. Real=${jormuntideIgnis?.combinations.length ?? 0}`);
  }
  const wumpoCount = data.pals.filter((pal) => pal.name === "Wumpo").length;
  if (wumpoCount !== 1) {
    errors.push(`Wumpo debe existir una sola vez. Real=${wumpoCount}`);
  }
  if (errors.length > 0) {
    throw new SafeError(`Archivo de crianza invalido:\n${errors.join("\n")}`);
  }
}

function normalizeCombination(target: string, combination: BreedingCombination): BreedingCombination {
  return {
    ...combination,
    target,
    parent1: { name: canonicalPalName(combination.parent1?.name ?? ""), gender: combination.parent1?.gender ?? null },
    parent2: { name: canonicalPalName(combination.parent2?.name ?? ""), gender: combination.parent2?.gender ?? null },
    sources: [...new Set(combination.sources ?? [])],
    sourceUpdatedAtBySource: combination.sourceUpdatedAtBySource ?? Object.fromEntries((combination.sources ?? []).map((source) => [source, combination.sourceUpdatedAt]))
  };
}

function validateCombination(palName: string, combination: BreedingCombination, errors: string[]): void {
  if (!combination.parent1?.name || !combination.parent2?.name) {
    errors.push(`Padres vacios en ${palName}.`);
  }
  if (!genders.has(combination.parent1?.gender ?? null) || !genders.has(combination.parent2?.gender ?? null)) {
    errors.push(`Sexo invalido en ${palName}: ${combination.parent1?.gender}/${combination.parent2?.gender}`);
  }
  if (!Array.isArray(combination.sources) || combination.sources.length === 0 || combination.sources.some((source) => !sourceIds.has(source))) {
    errors.push(`Fuentes invalidas en ${palName}: ${combination.sources?.join(",")}`);
  }
  if (!statuses.has(combination.verificationStatus)) {
    errors.push(`Estado invalido en ${palName}: ${combination.verificationStatus}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(combination.sourceUpdatedAt)) {
    errors.push(`Fecha invalida en ${palName}: ${combination.sourceUpdatedAt}`);
  }
}

function expectCount(errors: string[], label: string, expected: number, actual: number): void {
  if (actual !== expected) {
    errors.push(`${label}: esperado=${expected} real=${actual}`);
  }
}

function filterTitle(filter: BreedingFilter): string {
  if (filter === "verified") {
    return "Combinaciones de fuente marcada para Palworld 1.0";
  }
  if (filter === "legacy") {
    return "Combinaciones adicionales por verificar";
  }
  return "Combinaciones disponibles";
}

function statusLabel(status: BreedingVerificationStatus): string {
  return status === "SOURCE_MARKED_1_0" ? "marcada para Palworld 1.0" : "requiere verificacion 1.0";
}

function formatParent(parent: BreedingCombination["parent1"]): string {
  if (parent.gender === "FEMALE") {
    return `${parent.name} hembra`;
  }
  if (parent.gender === "MALE") {
    return `${parent.name} macho`;
  }
  return parent.name;
}

function formatSourceDates(combination: BreedingCombination, sources: BreedingDataFile["sources"]): string {
  return combination.sources
    .map((source) => `${sources[source].label} ${combination.sourceUpdatedAtBySource?.[source] ?? sources[source].updatedAt}`)
    .join(", ");
}

function trimDiscordContent(value: string): string {
  if (value.length <= 1900) {
    return value;
  }
  return `${value.slice(0, 1850)}\n\nResultado recortado por limite de Discord. Usa filtros para reducir la consulta.`;
}
