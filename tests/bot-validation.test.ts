import { ChannelType, PermissionFlagsBits, PermissionsBitField, type Guild, type GuildMember, type TextChannel } from "discord.js";
import { describe, expect, it } from "vitest";
import type { BotEnv } from "../src/bot-config.js";
import { validateBotConfiguration } from "../src/bot-validation.js";

const env: BotEnv = {
  DISCORD_BOT_TOKEN: "secret",
  DISCORD_GUILD_ID: "guild",
  WELCOME_CHANNEL_ID: "welcome",
  RULES_CHANNEL_ID: "rules",
  ROLES_CHANNEL_ID: "roles",
  MEMBER_ROLE_ID: "member-role",
  MEMBER_LOG_CHANNEL_ID: "log"
};

function textChannel(id: string, canSend = true): TextChannel {
  return {
    id,
    type: ChannelType.GuildText,
    permissionsFor: () => ({
      has: (permission: bigint) => canSend && permission === PermissionFlagsBits.SendMessages
    })
  } as unknown as TextChannel;
}

function guildWithRole(rolePosition = 1): Guild {
  const channels = new Map([
    ["welcome", textChannel("welcome")],
    ["rules", textChannel("rules")],
    ["roles", textChannel("roles")],
    ["log", textChannel("log")]
  ]);

  return {
    channels: {
      fetch: async (id: string) => channels.get(id) ?? null
    },
    roles: {
      fetch: async (id: string) => id === "member-role"
        ? {
            id,
            managed: false,
            position: rolePosition
          }
        : null
    }
  } as unknown as Guild;
}

function botMember(compareResult = 1, canManageRoles = true): GuildMember {
  return {
    permissions: new PermissionsBitField(canManageRoles ? [PermissionFlagsBits.ManageRoles] : []),
    roles: {
      highest: {
        comparePositionTo: () => compareResult
      }
    }
  } as unknown as GuildMember;
}

describe("bot validation", () => {
  it("accepts valid configured channels and role hierarchy", async () => {
    const result = await validateBotConfiguration(guildWithRole(), botMember(), env);

    expect(result.errors).toEqual([]);
  });

  it("rejects member role when bot role is not higher", async () => {
    const result = await validateBotConfiguration(guildWithRole(), botMember(0), env);

    expect(result.errors).toContain("El rol mas alto del bot debe estar por encima de MEMBER_ROLE_ID.");
  });

  it("rejects missing configured channels", async () => {
    const result = await validateBotConfiguration(guildWithRole(), botMember(), {
      ...env,
      WELCOME_CHANNEL_ID: "missing"
    });

    expect(result.errors).toContain("WELCOME_CHANNEL_ID no corresponde a un canal existente.");
  });
});
