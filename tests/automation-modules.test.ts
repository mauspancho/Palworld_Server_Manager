import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeJsonAtomic, readJsonFile } from "../src/atomic-json.js";
import { detectRaidRisk } from "../src/anti-raid.js";
import { slashCommandDefinitions } from "../src/commands-definitions.js";
import { loadDesiredStructure } from "../src/config.js";
import { validateFutureEventDate, dueReminderMinutes } from "../src/events-logic.js";
import { loadGuildsConfig } from "../src/guilds-config.js";
import { calculateUniqueGuildAssignment, canUseGuildAdminCommand } from "../src/guilds-logic.js";
import { runPalworldControl } from "../src/palworld-control.js";
import { createLinkCode, hashLinkCode, isLinkExpired } from "../src/player-linking.js";
import { DisabledRconClient, sanitizeRconError, TcpRconProbe } from "../src/rcon-client.js";
import { mapSystemdStatus, parseSystemctlShow, shouldSendStatusAlert } from "../src/status-probe.js";
import { buildStatusEmbed } from "../src/status-panel.js";
import { applySuggestionVote, suggestionVoteCounts, type SuggestionRecord } from "../src/suggestions-logic.js";
import { closeTicketRecord, createTicketRecord, emptyTicketsData, findOpenTicketForUser, formatTicketChannelName, reopenTicketRecord } from "../src/tickets-logic.js";

describe("forum structure", () => {
  it("loads forum channels and configured tags", async () => {
    const structure = await loadDesiredStructure(path.join(process.cwd(), "config", "server-structure.yml"));
    const palworld = structure.categories.find((category) => category.name.includes("PALWORLD"));
    const forums = palworld?.channels.filter((channel) => channel.type === "forum") ?? [];

    expect(forums).toHaveLength(3);
    expect(forums[0]?.tags).toContain("Busco");
    expect(forums[1]?.tags).toContain("PC-Steam");
  });
});

describe("guilds", () => {
  it("loads guilds config", async () => {
    const config = await loadGuildsConfig(process.cwd());

    expect(config.guilds).toHaveLength(5);
    expect(config.guilds.map((guild) => guild.roleName)).toContain("Gremio 1");
  });

  it("calculates single guild assignment without touching other roles", () => {
    const change = calculateUniqueGuildAssignment(["g1", "g2", "g3"], ["member", "g1", "other"], "g2");

    expect(change).toEqual({ addRoleId: "g2", removeRoleIds: ["g1"] });
  });

  it("checks guild admin roles", () => {
    expect(canUseGuildAdminCommand(["Miembros", "Moderador"], ["Admin", "Moderador"])).toBe(true);
    expect(canUseGuildAdminCommand(["Miembros"], ["Admin", "Moderador"])).toBe(false);
  });
});

describe("status panel", () => {
  it("parses systemctl show output", () => {
    expect(parseSystemctlShow("MainPID=123\nMemoryCurrent=1048576\n")).toEqual({ MainPID: "123", MemoryCurrent: "1048576" });
  });

  it("detects status changes that need alerts", () => {
    expect(mapSystemdStatus("active", true)).toBe("online");
    expect(shouldSendStatusAlert("online", "offline")).toBe(true);
    expect(shouldSendStatusAlert("offline", "offline")).toBe(false);
    expect(shouldSendStatusAlert("starting", "failed")).toBe(true);
  });

  it("builds status embeds", () => {
    const embed = buildStatusEmbed({
      status: "online",
      serviceName: "palworld.service",
      port: 8211,
      uptime: "today",
      memory: "100 MB",
      mainPid: "123",
      players: "0/32",
      rcon: "disabled",
      checkedAt: "2026-07-23T00:00:00.000Z"
    }).toJSON();

    expect(embed.title).toBe("Estado del servidor Palworld");
    expect(embed.fields?.some((field) => field.name === "Estado")).toBe(true);
  });
});

describe("tickets", () => {
  it("prevents duplicate open tickets and supports close/reopen", () => {
    const data = emptyTicketsData();
    const ticket = createTicketRecord(data, "user", "channel", "technical");

    expect(findOpenTicketForUser(data, "user")).toBe(ticket);
    expect(() => createTicketRecord(data, "user", "other", "admin")).toThrow(/abierto/);
    closeTicketRecord(ticket);
    expect(ticket.status).toBe("closed");
    reopenTicketRecord(ticket);
    expect(ticket.status).toBe("open");
  });

  it("formats ticket channel names safely", () => {
    expect(formatTicketChannelName(1, "Maus Pancho!", true)).toBe("cerrado-0001-maus-pancho-");
  });
});

describe("suggestions", () => {
  it("counts votes and replaces previous vote", () => {
    const record: SuggestionRecord = { id: "s1", authorId: "author", title: "T", description: "D", status: "En votacion", votes: {} };
    applySuggestionVote(record, "u1", "up");
    applySuggestionVote(record, "u1", "down");
    applySuggestionVote(record, "u2", "up");

    expect(suggestionVoteCounts(record)).toEqual({ up: 1, down: 1 });
  });
});

describe("events", () => {
  it("rejects past dates and calculates unsent reminders", () => {
    expect(() => validateFutureEventDate(new Date("2026-01-01"), new Date("2026-07-23"))).toThrow(/pasadas/);
    expect(dueReminderMinutes(new Date("2026-07-24T12:00:00Z"), new Date("2026-07-24T11:10:00Z"), [1440])).toEqual([60]);
  });
});

describe("anti raid", () => {
  it("detects join bursts and new accounts without banning", () => {
    const now = Date.now();
    const events = Array.from({ length: 8 }, (_, index) => ({ userId: String(index), joinedAt: now - 1000, accountCreatedAt: now - 60_000 }));

    const detection = detectRaidRisk(events, { enabled: true, joinThreshold: 8, windowSeconds: 60, minAccountAgeHours: 24 }, now);

    expect(detection.triggered).toBe(true);
    expect(detection.reasons.length).toBeGreaterThan(0);
  });
});

describe("rcon and control", () => {
  it("keeps RCON disabled unless configured", async () => {
    await expect(new DisabledRconClient().send()).rejects.toThrow(/desactivado/);
    await expect(new TcpRconProbe({ enabled: false, host: "127.0.0.1", port: null, passwordConfigured: false, timeoutMs: 1, allowedCommands: [] }).test()).resolves.toBe(false);
  });

  it("sanitizes RCON password and blocks disabled control", async () => {
    expect(sanitizeRconError("password abc123", "abc123")).not.toContain("abc123");
    await expect(runPalworldControl("restart")).rejects.toThrow(/desactivado/);
  });
});

describe("player linking", () => {
  it("hashes one-time codes and expires them", () => {
    const { code, record } = createLinkCode("user", new Date("2026-07-23T00:00:00Z"));

    expect(record.codeHash).toBe(hashLinkCode(code));
    expect(record.codeHash).not.toBe(code);
    expect(isLinkExpired(record, new Date("2026-07-23T00:11:00Z"))).toBe(true);
  });
});

describe("commands and atomic writes", () => {
  it("defines guild-scoped slash commands", () => {
    const names = slashCommandDefinitions().map((command) => command.name);

    expect(names).toContain("gremio");
    expect(names).toContain("estado");
    expect(names).toContain("vincular");
  });

  it("writes JSON atomically", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "palworld-manager-"));
    const file = path.join(dir, "data.json");
    await writeJsonAtomic(file, { ok: true });

    expect(await readJsonFile(file, { ok: false })).toEqual({ ok: true });
  });
});
