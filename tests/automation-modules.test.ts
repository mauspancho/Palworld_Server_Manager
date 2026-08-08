import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { writeJsonAtomic, readJsonFile } from "../src/atomic-json.js";
import { detectRaidRisk } from "../src/anti-raid.js";
import { slashCommandDefinitions } from "../src/commands-definitions.js";
import { commandAccessLevel, restrictedCommandNames, publicCommandNames } from "../src/command-access.js";
import { handleBotInteraction } from "../src/bot-interactions.js";
import { loadDesiredStructure } from "../src/config.js";
import { validateFutureEventDate, dueReminderMinutes } from "../src/events-logic.js";
import { loadGuildsConfig } from "../src/guilds-config.js";
import {
  addGuildMember,
  approveGuildRequest,
  calculateUniqueGuildAssignment,
  cancelGuildRequest,
  canManageGuildCommunity,
  canUseGuildAdminCommand,
  createGuildRequest,
  guildRoleName,
  rejectGuildRequest,
  guildTextChannelName,
  guildVoiceChannelName,
  removeGuildMember
} from "../src/guilds-logic.js";
import {
  buildGuildRejectModal,
  buildGuildRequestReviewPayload,
  guildRequestApprovePrefix,
  guildRequestCancelPrefix,
  guildRequestRejectPrefix
} from "../src/guilds-components.js";
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
    expect(config.requestChannelName).toBe("solicitudes-gremios");
  });

  it("calculates single guild assignment without touching other roles", () => {
    const change = calculateUniqueGuildAssignment(["g1", "g2", "g3"], ["member", "g1", "other"], "g2");

    expect(change).toEqual({ addRoleId: "g2", removeRoleIds: ["g1"] });
  });

  it("checks guild admin roles", () => {
    expect(canUseGuildAdminCommand(["Miembros", "Moderador"], ["Admin", "Moderador"])).toBe(true);
    expect(canUseGuildAdminCommand(["Miembros"], ["Admin", "Moderador"])).toBe(false);
  });

  it("creates and approves private guild requests with a leader", () => {
    const data = { guilds: [] };
    const request = createGuildRequest(data, {
      discordGuildId: "discord",
      ownerId: "leader",
      name: "Los Exploradores",
      memberIds: ["member", "leader"],
      now: new Date("2026-08-08T00:00:00.000Z")
    });

    expect(request.id).toContain("los-exploradores");
    expect(request.memberIds).toEqual(["leader", "member"]);
    expect(request.status).toBe("pending");
    expect(approveGuildRequest(request, "admin", new Date("2026-08-08T01:00:00.000Z"))).toMatchObject({
      status: "active",
      ownerId: "leader",
      approvedBy: "admin"
    });
    expect(guildRoleName(request.name)).toBe("Gremio - Los Exploradores");
    expect(guildTextChannelName(request.name)).toBe("gremio-los-exploradores");
    expect(guildVoiceChannelName(request.name)).toBe("voz-los-exploradores");
  });

  it("lets only the leader or admins manage guild members", () => {
    const active = approveGuildRequest(createGuildRequest({ guilds: [] }, {
      discordGuildId: "discord",
      ownerId: "leader",
      name: "Constructores"
    }), "admin");

    expect(canManageGuildCommunity(active, "leader", ["Miembros"], ["Admin", "Moderador"])).toBe(true);
    expect(canManageGuildCommunity(active, "other", ["Admin"], ["Admin", "Moderador"])).toBe(true);
    expect(canManageGuildCommunity(active, "other", ["Miembros"], ["Admin", "Moderador"])).toBe(false);
    expect(addGuildMember(active, "member").memberIds).toContain("member");
    expect(removeGuildMember(addGuildMember(active, "member"), "member").memberIds).not.toContain("member");
    expect(() => removeGuildMember(active, "leader")).toThrow(/lider/);
  });

  it("builds admin review controls and keeps rejection reasons", () => {
    const request = createGuildRequest({ guilds: [] }, {
      discordGuildId: "discord",
      ownerId: "leader",
      name: "Raiders"
    });
    const payload = buildGuildRequestReviewPayload(request);
    const buttonIds = payload.components[0]!.toJSON().components.map((component) => component.custom_id);
    const rejected = rejectGuildRequest(request, "admin", "Nombre no permitido", new Date("2026-08-08T02:00:00.000Z"));
    const cancelled = cancelGuildRequest(request, "admin", new Date("2026-08-08T03:00:00.000Z"));

    expect(buttonIds).toEqual([
      `${guildRequestApprovePrefix}${request.id}`,
      `${guildRequestRejectPrefix}${request.id}`,
      `${guildRequestCancelPrefix}${request.id}`
    ]);
    expect(buildGuildRejectModal(request).toJSON().custom_id).toContain(request.id);
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "Nombre no permitido" });
    expect(cancelled).toMatchObject({ status: "cancelled", cancelledBy: "admin" });
    expect(buildGuildRequestReviewPayload(rejected).components).toEqual([]);
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
    expect(names).toContain("solicitudes-pendientes");
    expect(names).toContain("estado");
    expect(names).toContain("crianza");
    expect(names).toContain("crianza-panel");
    expect(names).toContain("vincular");
    const breeding = slashCommandDefinitions().find((command) => command.name === "crianza");
    expect(breeding?.options?.[0]).toMatchObject({ name: "pal", autocomplete: true });
    const guildOptions = slashCommandDefinitions().find((command) => command.name === "gremio")?.options?.map((option) => option.name) ?? [];
    expect(guildOptions).toEqual(expect.arrayContaining(["solicitar", "solicitudes", "aprobar", "rechazar", "agregar", "eliminar"]));
  });

  it("classifies public and restricted slash commands with default permissions", () => {
    const commands = new Map(slashCommandDefinitions().map((command) => [command.name, command]));

    expect(commandAccessLevel("crianza")).toBe("public");
    expect(commandAccessLevel("gremio")).toBe("public");
    expect(commandAccessLevel("solicitudes-pendientes")).toBe("administrator");
    expect(commandAccessLevel("crianza-panel")).toBe("administrator");
    expect(publicCommandNames()).toContain("crianza");
    expect(publicCommandNames()).toContain("gremio");
    expect(restrictedCommandNames()).toContain("crianza-panel");
    expect(restrictedCommandNames()).toContain("solicitudes-pendientes");
    expect(commands.get("crianza")?.default_member_permissions).toBeUndefined();
    expect(commands.get("gremio")?.default_member_permissions).toBeUndefined();
    expect(commands.get("solicitudes-pendientes")?.default_member_permissions).toBe(PermissionFlagsBits.Administrator.toString());
    expect(commands.get("crianza-panel")?.default_member_permissions).toBe(PermissionFlagsBits.Administrator.toString());
    expect(commands.get("informacion")?.default_member_permissions).toBe(PermissionFlagsBits.Administrator.toString());
    expect(commands.get("palworld")?.default_member_permissions).toBe(PermissionFlagsBits.Administrator.toString());
    const palworldOptions = commands.get("palworld")?.options?.map((option) => option.name) ?? [];
    expect(palworldOptions).toEqual(expect.arrayContaining(["iniciar", "detener", "reiniciar-ahora"]));
  });

  it("rejects normal users and allows admins for restricted runtime commands", async () => {
    const normal = commandInteraction("palworld", []);
    await handleBotInteraction(normal as any, botEnv(), process.cwd());
    expect(normal.reply).toHaveBeenCalledWith({ content: "No tienes permisos para utilizar este comando.", flags: 64 });

    const admin = commandInteraction("palworld", ["Admin"]);
    await handleBotInteraction(admin as any, botEnv(), process.cwd());
    expect(admin.reply).toHaveBeenCalledWith({ content: "Control Palworld bloqueado mientras PALWORLD_CONTROL_ENABLED=false.", flags: 64 });
  });

  it("writes JSON atomically", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "palworld-manager-"));
    const file = path.join(dir, "data.json");
    await writeJsonAtomic(file, { ok: true });

    expect(await readJsonFile(file, { ok: false })).toEqual({ ok: true });
  });
});

function commandInteraction(commandName: string, roleNames: string[]) {
  const reply = vi.fn(async () => undefined);
  return {
    guild: {
      members: {
        fetch: async () => memberWithRoles(roleNames)
      }
    },
    guildId: "guild",
    user: { id: "user", bot: false },
    commandName,
    member: memberWithRoles(roleNames),
    reply,
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isStringSelectMenu: () => false,
    isButton: () => false
  };
}

function memberWithRoles(roleNames: string[]) {
  return {
    roles: {
      cache: {
        some: (predicate: (role: { name: string }) => boolean) => roleNames.some((name) => predicate({ name }))
      }
    }
  };
}

function botEnv() {
  return {
    DISCORD_BOT_TOKEN: "secret",
    DISCORD_GUILD_ID: "guild",
    WELCOME_CHANNEL_ID: "welcome",
    RULES_CHANNEL_ID: "rules",
    ROLES_CHANNEL_ID: "roles",
    GENERAL_CHAT_CHANNEL_ID: "general",
    MEMBER_ROLE_ID: "member",
    MEMBER_LOG_CHANNEL_ID: "log",
    BREEDING_CHANNEL_ID: "breeding"
  };
}
