import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PermissionsBitField, PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  autocompleteBreedingPals,
  breedingCombinationKey,
  breedingDataPath,
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
import { decideBreedingPublishAction } from "../src/breeding-publisher.js";
import { handleBreedingInteraction } from "../src/breeding-interactions.js";
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

    expect(anubis).toContain("Blazamut + Dualith = Anubis");
    expect(anubis).toContain("Total: 3");
    expect(wumpoBotan).toContain("requiere verificacion");
    expect(katress).toContain("Katress hembra + Wixen macho = Katress Ignis");
    expect(katress).toContain("sexo indicado");
    expect(renderBreedingResult(queryBreedingPal(catalog, "Katress Ignis", "verified")!, catalog.data.sources))
      .toContain("No hay combinaciones registradas para este Pal.");
  });
});

describe("breeding panel", () => {
  it("builds the complete pal list without alphabetical page selectors", async () => {
    const catalog = await loadBreedingCatalog(process.cwd());
    const payload = buildBreedingPanelPayload(catalog);

    expect(payload.components).toHaveLength(4);
    for (const row of payload.components) {
      const component = row.components[0]!.toJSON() as { options?: unknown[] };
      expect(component.options?.length ?? 0).toBeLessThanOrEqual(25);
    }
    const selects = buildBreedingBrowseComponents(catalog, "all", "ignored").map((row) => row.components[0]!.toJSON());
    expect(selects.map((select) => select.custom_id)).toEqual(["breeding:pal:all:0", "breeding:pal:all:1", "breeding:pal:all:2", "breeding:pal:all:3"]);
    const labels = selects.flatMap((select) => select.options.map((option) => option.label));
    expect(labels).toHaveLength(filterPals(catalog, "all").length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(expect.arrayContaining(["Aegidron", "Anubis", "Wumpo Botan"]));
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
    expect(decideBreedingPublishAction(true, true)).toBe("update");
    expect(decideBreedingPublishAction(true, false)).toBe("create");
  });

  it("answers /crianza queries ephemerally through the persistent handler", async () => {
    const deferred: unknown[] = [];
    const edits: unknown[] = [];
    const interaction: any = {
      commandName: "crianza",
      guild: {},
      guildId: "guild",
      channelId: "breeding",
      user: { id: "user", bot: false },
      options: { getString: () => "Anubis" },
      deferred: false,
      replied: false,
      deferReply: async (payload: unknown) => { deferred.push(payload); interaction.deferred = true; },
      editReply: async (payload: unknown) => { edits.push(payload); },
      reply: async (payload: unknown) => { edits.push(payload); },
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      isStringSelectMenu: () => false,
      isButton: () => false
    };
    const handled = await handleBreedingInteraction(interaction, {
      DISCORD_BOT_TOKEN: "secret",
      DISCORD_GUILD_ID: "guild",
      WELCOME_CHANNEL_ID: "welcome",
      RULES_CHANNEL_ID: "rules",
      ROLES_CHANNEL_ID: "roles",
      GENERAL_CHAT_CHANNEL_ID: "general",
      MEMBER_ROLE_ID: "member",
      MEMBER_LOG_CHANNEL_ID: "log",
      BREEDING_CHANNEL_ID: "breeding"
    }, process.cwd());

    expect(handled).toBe(true);
    expect(deferred[0]).toMatchObject({ ephemeral: true });
    expect(JSON.stringify(edits[0])).toContain("Anubis");
  });

  it("defers pal select interactions before returning the combinations", async () => {
    const deferred: unknown[] = [];
    const edits: unknown[] = [];
    const interaction: any = {
      customId: "breeding:pal:all:a-d",
      guild: {},
      guildId: "guild",
      channelId: "breeding",
      user: { id: "user", bot: false },
      values: ["anubis"],
      deferred: false,
      replied: false,
      deferReply: async (payload: unknown) => { deferred.push(payload); interaction.deferred = true; },
      editReply: async (payload: unknown) => { edits.push(payload); },
      reply: async (payload: unknown) => { edits.push(payload); },
      followUp: async (payload: unknown) => { edits.push(payload); },
      isAutocomplete: () => false,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => true,
      isButton: () => false
    };

    const handled = await handleBreedingInteraction(interaction, {
      DISCORD_BOT_TOKEN: "secret",
      DISCORD_GUILD_ID: "guild",
      WELCOME_CHANNEL_ID: "welcome",
      RULES_CHANNEL_ID: "rules",
      ROLES_CHANNEL_ID: "roles",
      GENERAL_CHAT_CHANNEL_ID: "general",
      MEMBER_ROLE_ID: "member",
      MEMBER_LOG_CHANNEL_ID: "log",
      BREEDING_CHANNEL_ID: "breeding"
    }, process.cwd());

    expect(handled).toBe(true);
    expect(deferred[0]).toMatchObject({ ephemeral: true });
    expect(JSON.stringify(edits[0])).toContain("Blazamut + Dualith = Anubis");
  });

  it("defers the back button before rebuilding the pal list", async () => {
    const deferred: unknown[] = [];
    const edits: unknown[] = [];
    const interaction: any = {
      customId: "breeding:back:all:a-d",
      guild: {},
      guildId: "guild",
      channelId: "breeding",
      user: { id: "user", bot: false },
      deferred: false,
      replied: false,
      deferUpdate: async () => { deferred.push("deferred"); interaction.deferred = true; },
      editReply: async (payload: unknown) => { edits.push(payload); },
      reply: async (payload: unknown) => { edits.push(payload); },
      followUp: async (payload: unknown) => { edits.push(payload); },
      isAutocomplete: () => false,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => false,
      isButton: () => true
    };

    const handled = await handleBreedingInteraction(interaction, {
      DISCORD_BOT_TOKEN: "secret",
      DISCORD_GUILD_ID: "guild",
      WELCOME_CHANNEL_ID: "welcome",
      RULES_CHANNEL_ID: "rules",
      ROLES_CHANNEL_ID: "roles",
      GENERAL_CHAT_CHANNEL_ID: "general",
      MEMBER_ROLE_ID: "member",
      MEMBER_LOG_CHANNEL_ID: "log",
      BREEDING_CHANNEL_ID: "breeding"
    }, process.cwd());

    expect(handled).toBe(true);
    expect(deferred).toEqual(["deferred"]);
    expect(JSON.stringify(edits[0])).toContain("Selecciona el Pal");
  });

  it("defers the close button before closing the ephemeral result", async () => {
    const deferred: unknown[] = [];
    const edits: unknown[] = [];
    const interaction: any = {
      customId: "breeding:close",
      guild: {},
      guildId: "guild",
      channelId: "breeding",
      user: { id: "user", bot: false },
      deferred: false,
      replied: false,
      deferUpdate: async () => { deferred.push("deferred"); interaction.deferred = true; },
      editReply: async (payload: unknown) => { edits.push(payload); },
      reply: async (payload: unknown) => { edits.push(payload); },
      followUp: async (payload: unknown) => { edits.push(payload); },
      isAutocomplete: () => false,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => false,
      isButton: () => true
    };

    const handled = await handleBreedingInteraction(interaction, {
      DISCORD_BOT_TOKEN: "secret",
      DISCORD_GUILD_ID: "guild",
      WELCOME_CHANNEL_ID: "welcome",
      RULES_CHANNEL_ID: "rules",
      ROLES_CHANNEL_ID: "roles",
      GENERAL_CHAT_CHANNEL_ID: "general",
      MEMBER_ROLE_ID: "member",
      MEMBER_LOG_CHANNEL_ID: "log",
      BREEDING_CHANNEL_ID: "breeding"
    }, process.cwd());

    expect(handled).toBe(true);
    expect(deferred).toEqual(["deferred"]);
    expect(edits[0]).toMatchObject({ content: "Consulta cerrada.", components: [] });
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
