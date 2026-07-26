import { ChannelType, Collection, PermissionFlagsBits, PermissionsBitField, type Guild, type GuildMember } from "discord.js";
import { describe, expect, it } from "vitest";
import type { DesiredStructure } from "../src/domain.js";
import {
  buildInformationReadOnlyNotice,
  canPublishInInformationChannel,
  informationPermissionTargets,
  isInformationChannelName,
  permissionOverwriteDiff,
  validateInformationPermissionConfiguration
} from "../src/info-permissions.js";

const desired: DesiredStructure = {
  protectedRoleNames: ["Admin", "Palworld Server Manager"],
  administrativeRoleNames: ["Admin", "Palworld Server Manager"],
  categories: [
    {
      name: "📌 INFORMACIÓN",
      channels: [
        { name: "👋・bienvenida", type: "text" },
        { name: "📜・reglas", type: "text" },
        { name: "📢・anuncios", type: "text" },
        { name: "🌐・datos-del-servidor", type: "text" },
        { name: "🎭・elige-tus-roles", type: "text" }
      ]
    }
  ]
};

describe("information permissions", () => {
  it("builds read-only overwrites for members and publisher overwrites for admins and bot", () => {
    const targets = informationPermissionTargets({
      guildId: "guild",
      memberRoleId: "member",
      pendingMemberRoleId: "pending",
      adminRoleIds: [{ id: "admin", name: "Admin" }],
      botRoleIds: [{ id: "bots", name: "Bots" }],
      botUserId: "bot-user"
    });

    expect(targets.map((target) => target.id)).toEqual(["guild", "member", "pending", "admin", "bots", "bot-user"]);
    expect(targets[0]?.options.ViewChannel).toBe(true);
    expect(targets[0]?.options.ReadMessageHistory).toBe(true);
    expect(targets[0]?.options.SendMessages).toBe(false);
    expect(targets[0]?.options.CreatePublicThreads).toBe(false);
    expect(targets[0]?.options.AttachFiles).toBe(false);
    expect(targets[3]?.options.SendMessages).toBe(true);
    expect(targets[5]?.options.ManageMessages).toBe(true);
  });

  it("detects idempotent overwrites and missing deny changes", () => {
    const target = informationPermissionTargets({ guildId: "guild" })[0]!;
    const existing = {
      allow: new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]),
      deny: new PermissionsBitField([
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.SendVoiceMessages,
        PermissionFlagsBits.UseApplicationCommands,
        PermissionFlagsBits.MentionEveryone,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageThreads,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.CreateInstantInvite
      ])
    };

    expect(permissionOverwriteDiff(existing, target.options)).toEqual([]);
    expect(permissionOverwriteDiff(undefined, target.options)).toContain("SendMessages");
  });

  it("protects only known information channels and allows administrative publishers", () => {
    expect(isInformationChannelName("📜・reglas")).toBe(true);
    expect(isInformationChannelName("chat-general")).toBe(false);
    expect(canPublishInInformationChannel(["Miembro"], desired)).toBe(false);
    expect(canPublishInInformationChannel(["Admin"], desired)).toBe(true);
    expect(canPublishInInformationChannel(["Bots"], desired, true)).toBe(true);
  });

  it("builds a warning without exposing secrets", () => {
    const notice = buildInformationReadOnlyNotice("guild", "general");

    expect(notice.content).toContain("<#general>");
    expect(notice.content).toContain("https://discord.com/channels/guild/general");
  });

  it("validates bot permissions for information channel repair and cleanup", async () => {
    const result = await validateInformationPermissionConfiguration(guildWithInformationChannels(), botMember([
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages
    ]), desired);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("rejects missing moderation permissions", async () => {
    const result = await validateInformationPermissionConfiguration(guildWithInformationChannels(), botMember([]), desired);

    expect(result.errors).toContain("El bot necesita ManageChannels para reparar permisos de canales informativos.");
    expect(result.errors).toContain("El bot necesita ManageMessages para retirar mensajes no autorizados en canales informativos.");
  });
});

function guildWithInformationChannels(): Guild {
  const channels = new Collection<string, any>();
  for (const channel of desired.categories[0]!.channels) {
    channels.set(channel.name, {
      id: channel.name,
      name: channel.name,
      type: ChannelType.GuildText,
      permissionsFor: () => new PermissionsBitField([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages
      ])
    });
  }

  return {
    id: "guild",
    channels: {
      fetch: async () => channels
    }
  } as unknown as Guild;
}

function botMember(permissions: bigint[]): GuildMember {
  return {
    permissions: new PermissionsBitField(permissions)
  } as unknown as GuildMember;
}
