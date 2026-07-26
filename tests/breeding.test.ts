import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PermissionsBitField, PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  autocompleteBreedingPals,
  breedingCombinationKey,
  breedingDataPath,
  breedingPageRanges,
  createBreedingCatalog,
  filterPals,
  loadBreedingCatalog,
  normalizeBreedingData,
  queryBreedingPal,
  readBreedingDataFile,
  renderBreedingResult,
  summarizeBreedingData
} from "../src/breeding-service.js";
import { buildBreedingBrowseComponents, buildBreedingPanelPayload } from "../src/breeding-components.js";
import { readBreedingPanelState, writeBreedingPanelState } from "../src/breeding-state.js";
import { validateBreedingChannelPermissions } from "../src/breeding-permissions.js";
import type { BreedingDataFile } from "../src/breeding-types.js";

describe("breeding data", () => {
  it("loads the versioned breeding file with required counts", async () => {
    const catalog = await loadBreedingCatalog(process.cwd());
    const summary = summarizeBreedingData(catalog);

    expect(breedingDataPath(process.cwd())).toContain(path.join("config", "breeding-combinations.json"));
    expect(summary).toEqual({
      palCount: 86,
      combinationCount: 113,
      gamesCombinationCount: 42,
      vandalAdditionalCombinationCount: 71
    });
  });

  it("rejects missing and corrupt files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "breeding-"));
    await expect(readBreedingDataFile(path.join(dir, "missing.json"))).rejects.toThrow(/inexistente/);
    const corrupt = path.join(dir, "bad.json");
    await fs.writeFile(corrupt, "{", "utf8");
    await expect(readBreedingDataFile(corrupt)).rejects.toThrow(/corrupto/);
  });

  it("enforces unique ids, names, duplicate keys and exact counts", async () => {
    const data = await readBreedingDataFile(breedingDataPath(process.cwd()));
    const broken: BreedingDataFile = { ...data, pals: data.pals.slice(1) };

    await expect(() => createBreedingCatalog(broken)).toThrow(/Pals objetivo/);
  });

  it("keeps required special cases", async () => {
    const catalog = await loadBreedingCatalog(process.cwd());

    expect(catalog.bySearchKey.get("wumpo")?.categories).toEqual(["Principiante", "Trabajador de base"]);
    expect(queryBreedingPal(catalog, "Wumpo Botan")?.combinations).toHaveLength(4);
    expect(queryBreedingPal(catalog, "Jormuntide Ignis")?.combinations).toHaveLength(1);
    expect(queryBreedingPal(catalog, "Ghangler Ignis")?.combinations[0]?.sources).toEqual(["GAMES_GG", "VANDAL"]);
  });

  it("normalizes aliases, case, accents, repeated spaces and composed names", async () => {
    const catalog = await loadBreedingCatalog(process.cwd());

    expect(queryBreedingPal(catalog, "  anubisanubis  ")?.pal.name).toBe("Anubis");
    expect(queryBreedingPal(catalog, "wumpo    botan")?.pal.name).toBe("Wumpo Botan");
    expect(queryBreedingPal(catalog, "HANGY CRYST")?.pal.name).toBe("Hangyu Cryst");
    expect(queryBreedingPal(catalog, "Ronbiquill Terra")?.pal.name).toBe("Robinquill Terra");
    expect(queryBreedingPal(catalog, "No existe")).toBeNull();
  });

  it("deduplicates inverted parent order while preserving sex restrictions", async () => {
    const data = await readBreedingDataFile(breedingDataPath(process.cwd()));
    const elphidran = data.pals.find((pal) => pal.name === "Elphidran Aqua")!;
    elphidran.combinations.push({
      ...elphidran.combinations[0]!,
      parent1: elphidran.combinations[0]!.parent2,
      parent2: elphidran.combinations[0]!.parent1
    });
    const normalized = normalizeBreedingData(data);
    const catalog = createBreedingCatalog(normalized);

    expect(queryBreedingPal(catalog, "Elphidran Aqua")?.combinations).toHaveLength(1);
    expect(queryBreedingPal(catalog, "Katress Ignis")?.combinations[0]?.parent1.gender).toBe("FEMALE");
    expect(queryBreedingPal(catalog, "Wixen Noct")?.combinations[0]?.parent1.gender).toBe("MALE");
    expect(breedingCombinationKey("Katress Ignis", queryBreedingPal(catalog, "Katress Ignis")!.combinations[0]!))
      .not.toBe(breedingCombinationKey("Wixen Noct", queryBreedingPal(catalog, "Wixen Noct")!.combinations[0]!));
  });

  it("filters by source status and category", async () => {
    const catalog = await loadBreedingCatalog(process.cwd());

    expect(queryBreedingPal(catalog, "Anubis", "verified")?.combinations).toHaveLength(3);
    expect(queryBreedingPal(catalog, "Katress Ignis", "legacy")?.combinations).toHaveLength(1);
    expect(queryBreedingPal(catalog, "Katress Ignis", "verified")?.combinations).toHaveLength(0);
    expect(filterPals(catalog, "all", "Sakurajima").map((pal) => pal.name)).toContain("Katress Ignis");
  });

  it("provides autocomplete limited to Discord maximum", async () => {
    const catalog = await loadBreedingCatalog(process.cwd());
    const all = autocompleteBreedingPals(catalog, "", 25);

    expect(all).toHaveLength(25);
    expect(autocompleteBreedingPals(catalog, "katress")[0]).toEqual({ name: "Katress Ignis", value: "Katress Ignis" });
    expect(autocompleteBreedingPals(catalog, "does-not-exist")).toEqual([]);
  });

  it("renders verified, mixed and gendered results with warnings", async () => {
    const catalog = await loadBreedingCatalog(process.cwd());
    const anubis = renderBreedingResult(queryBreedingPal(catalog, "Anubis")!, catalog.data.sources);
    const wumpoBotan = renderBreedingResult(queryBreedingPal(catalog, "Wumpo Botan")!, catalog.data.sources);
    const katress = renderBreedingResult(queryBreedingPal(catalog, "Katress Ignis")!, catalog.data.sources);

    expect(anubis).toContain("Blazamut x Dualith");
    expect(anubis).toContain("Total: 3");
    expect(wumpoBotan).toContain("requiere verificacion");
    expect(katress).toContain("Katress hembra x Wixen macho");
    expect(katress).toContain("sexo indicado");
  });
});

describe("breeding panel", () => {
  it("builds stable persistent components and reaches every page without exceeding 25 options", async () => {
    const catalog = await loadBreedingCatalog(process.cwd());
    const payload = buildBreedingPanelPayload(catalog);

    expect(payload.components).toHaveLength(3);
    expect(payload.components[0]!.components[0]!.toJSON().custom_id).toBe("breeding:filter");
    for (const page of breedingPageRanges) {
      const select = buildBreedingBrowseComponents(catalog, "all", page.id)[2]!.components[0]!.toJSON();
      expect(select.options.length).toBeGreaterThan(0);
      expect(select.options.length).toBeLessThanOrEqual(25);
    }
  });

  it("persists panel state for idempotent repair", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "breeding-state-"));
    await writeBreedingPanelState(dir, {
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      updatedAt: "2026-07-26T00:00:00.000Z"
    });

    expect(await readBreedingPanelState(dir)).toMatchObject({ messageId: "message" });
  });

  it("validates breeding channel permissions", () => {
    const channel = {
      permissionsFor: () => new PermissionsBitField([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages
      ])
    } as any;
    const member = {
      permissions: new PermissionsBitField([PermissionFlagsBits.ManageChannels]),
      roles: { highest: { comparePositionTo: () => 1 } }
    } as any;

    expect(validateBreedingChannelPermissions(member, channel)).toEqual([]);
  });
});
