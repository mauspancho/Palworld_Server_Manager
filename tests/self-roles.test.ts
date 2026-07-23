import path from "node:path";
import { PermissionsBitField, type Role } from "discord.js";
import { describe, expect, it } from "vitest";
import { validateSelfRolesConfig, loadSelfRolesConfig } from "../src/self-roles-config.js";
import { buildSelfRoleComponents } from "../src/self-roles-components.js";
import { isAssignableSelfRole } from "../src/self-roles-interactions.js";
import { calculateRoleChanges } from "../src/self-roles-logic.js";
import { decidePublishAction } from "../src/self-roles-publisher.js";
import type { BotEnv } from "../src/bot-config.js";
import type { ResolvedSelfRoleGroup, SelfRoleMessageState } from "../src/self-roles-types.js";

const env: BotEnv = {
  DISCORD_BOT_TOKEN: "secret",
  DISCORD_GUILD_ID: "guild",
  WELCOME_CHANNEL_ID: "welcome",
  RULES_CHANNEL_ID: "rules",
  ROLES_CHANNEL_ID: "roles",
  MEMBER_ROLE_ID: "member",
  MEMBER_LOG_CHANNEL_ID: "log"
};

describe("self roles config", () => {
  it("loads and validates config/self-roles.yml", async () => {
    const config = await loadSelfRolesConfig(path.join(process.cwd(), "config", "self-roles.yml"));

    expect(config.groups).toHaveLength(3);
    expect(config.groups[0]?.id).toBe("platform");
  });

  it("rejects protected administrative roles in self-role config", () => {
    expect(() => validateSelfRolesConfig({
      groups: [
        {
          id: "bad",
          title: "Bad",
          description: "Bad",
          minValues: 0,
          maxValues: 1,
          roles: [{ name: "Admin", description: "Nope" }]
        }
      ]
    })).toThrow(/protegido/);
  });
});

describe("self role changes", () => {
  it("adds selected roles and removes only unselected roles from the same group", () => {
    const changes = calculateRoleChanges(
      ["xbox", "pc", "ps"],
      ["member", "xbox", "events"],
      ["pc"],
      ["member"]
    );

    expect(changes).toEqual({
      addRoleIds: ["pc"],
      removeRoleIds: ["xbox"]
    });
  });

  it("does not remove protected role ids", () => {
    const changes = calculateRoleChanges(["member", "xbox"], ["member", "xbox"], ["xbox"], ["member"]);

    expect(changes.removeRoleIds).toEqual([]);
  });
});

describe("self role protections", () => {
  it("rejects member, administrative, managed and administrator roles", () => {
    expect(isAssignableSelfRole(fakeRole("member", "Miembros"), env)).toBe(false);
    expect(isAssignableSelfRole(fakeRole("admin", "Admin"), env)).toBe(false);
    expect(isAssignableSelfRole(fakeRole("bots", "Bots"), env)).toBe(false);
    expect(isAssignableSelfRole(fakeRole("managed", "Linked", true), env)).toBe(false);
    expect(isAssignableSelfRole(fakeRole("danger", "Danger", false, true), env)).toBe(false);
    expect(isAssignableSelfRole(fakeRole("xbox", "🎮 Xbox"), env)).toBe(true);
  });
});

describe("self role components", () => {
  it("generates one select menu per group using self-role custom ids", () => {
    const groups: ResolvedSelfRoleGroup[] = [
      {
        id: "platform",
        title: "Selecciona tu plataforma",
        description: "Elige",
        minValues: 0,
        maxValues: 2,
        roles: [
          { id: "xbox", name: "🎮 Xbox", description: "Xbox", emoji: "🎮" },
          { id: "pc", name: "🖥️ PC / Steam", description: "PC", emoji: "🖥️" }
        ]
      }
    ];

    const json = buildSelfRoleComponents(groups).map((component) => component.toJSON());

    expect(json).toHaveLength(1);
    expect(json[0]?.components[0]?.custom_id).toBe("self-role:platform");
    expect(json[0]?.components[0]?.options).toHaveLength(2);
  });
});

describe("self roles publisher", () => {
  it("updates an existing message instead of creating another", () => {
    const state: SelfRoleMessageState = {
      guildId: "guild",
      channelId: "roles",
      messageId: "message",
      updatedAt: "2026-07-23T00:00:00.000Z"
    };

    expect(decidePublishAction(state, true)).toBe("update");
    expect(decidePublishAction(state, false)).toBe("create");
    expect(decidePublishAction(null, true)).toBe("create");
  });
});

function fakeRole(id: string, name: string, managed = false, administrator = false): Role {
  return {
    id,
    name,
    managed,
    permissions: new PermissionsBitField(administrator ? [PermissionsBitField.Flags.Administrator] : [])
  } as unknown as Role;
}
