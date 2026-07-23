import fs from "node:fs/promises";
import path from "node:path";
import {
  ChannelType,
  Guild,
  NonThreadGuildBasedChannel,
  PermissionOverwrites,
  PermissionsBitField,
  Role
} from "discord.js";
import type {
  ChannelSnapshot,
  PermissionOverwriteSnapshot,
  RoleSnapshot,
  ServerSnapshot,
  SnapshotChannelType
} from "./domain.js";

const permissionFlags = Object.entries(PermissionsBitField.Flags);

export async function createSnapshot(guild: Guild): Promise<ServerSnapshot> {
  const [channels, roles] = await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const channelValues = [...channels.values()].filter((channel): channel is NonThreadGuildBasedChannel => channel !== null);
  const roleValues = [...roles.values()];

  const categoryNamesById = new Map(
    channelValues
      .filter((channel) => channel.type === ChannelType.GuildCategory)
      .map((channel) => [channel.id, channel.name])
  );

  return {
    schemaVersion: 1,
    guildId: guild.id,
    guildName: guild.name,
    createdAt: new Date().toISOString(),
    roles: roleValues.map(snapshotRole).sort((left, right) => right.position - left.position),
    channels: channelValues
      .map((channel) => snapshotChannel(channel, categoryNamesById))
      .filter((channel): channel is ChannelSnapshot => channel !== null)
      .sort((left, right) => {
        if (left.parentName === right.parentName) {
          return left.position - right.position;
        }
        return (left.parentName ?? left.name).localeCompare(right.parentName ?? right.name);
      })
  };
}

export async function writeBackup(backupsDir: string, snapshot: ServerSnapshot, label = "server-structure"): Promise<string> {
  await fs.mkdir(backupsDir, { recursive: true });
  const safeDate = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(backupsDir, `${label}-${safeDate}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return filePath;
}

function snapshotRole(role: Role): RoleSnapshot {
  return {
    id: role.id,
    name: role.name,
    position: role.position,
    color: role.color,
    hoist: role.hoist,
    managed: role.managed,
    mentionable: role.mentionable,
    permissions: namesFromBitfield(role.permissions)
  };
}

function snapshotChannel(channel: NonThreadGuildBasedChannel, categoryNamesById: Map<string, string>): ChannelSnapshot | null {
  const type = normalizeChannelType(channel.type);
  if (!type) {
    return null;
  }

  const base: ChannelSnapshot = {
    id: channel.id,
    name: channel.name,
    type,
    position: channel.position,
    parentId: channel.parentId,
    parentName: channel.parentId ? categoryNamesById.get(channel.parentId) ?? null : null,
    permissionOverwrites: channel.permissionOverwrites.cache.map(snapshotOverwrite)
  };

  if ("topic" in channel) {
    base.topic = channel.topic;
  }
  if ("nsfw" in channel) {
    base.nsfw = channel.nsfw;
  }
  if ("rateLimitPerUser" in channel) {
    base.rateLimitPerUser = channel.rateLimitPerUser ?? undefined;
  }
  if ("bitrate" in channel) {
    base.bitrate = channel.bitrate;
  }
  if ("userLimit" in channel) {
    base.userLimit = channel.userLimit;
  }

  return base;
}

function snapshotOverwrite(overwrite: PermissionOverwrites): PermissionOverwriteSnapshot {
  return {
    id: overwrite.id,
    type: overwrite.type === 0 ? "role" : "member",
    allow: namesFromBitfield(overwrite.allow),
    deny: namesFromBitfield(overwrite.deny)
  };
}

function normalizeChannelType(type: ChannelType): SnapshotChannelType | null {
  switch (type) {
    case ChannelType.GuildCategory:
      return "category";
    case ChannelType.GuildText:
      return "text";
    case ChannelType.GuildVoice:
      return "voice";
    default:
      return null;
  }
}

export function namesFromBitfield(bitfield: PermissionsBitField): string[] {
  return permissionFlags
    .filter(([, flag]) => bitfield.has(flag))
    .map(([name]) => name)
    .sort();
}
