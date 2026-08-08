import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import type { GuildCommunitiesData, GuildCommunityRecord } from "./guilds-types.js";

export function guildCommunitiesDataPath(rootDir: string): string {
  return path.join(rootDir, "data", "guild-communities.json");
}

export async function readGuildCommunitiesData(rootDir: string): Promise<GuildCommunitiesData> {
  return readJsonFile<GuildCommunitiesData>(guildCommunitiesDataPath(rootDir), { guilds: [] });
}

export async function writeGuildCommunitiesData(rootDir: string, data: GuildCommunitiesData): Promise<void> {
  await writeJsonAtomic(guildCommunitiesDataPath(rootDir), data);
}

export function upsertGuildCommunity(data: GuildCommunitiesData, record: GuildCommunityRecord): void {
  const index = data.guilds.findIndex((guild) => guild.id === record.id);
  if (index === -1) {
    data.guilds.push(record);
    return;
  }
  data.guilds[index] = record;
}

export function findGuildCommunityById(data: GuildCommunitiesData, id: string): GuildCommunityRecord | undefined {
  return data.guilds.find((guild) => guild.id === id);
}

export function findActiveGuildForMember(data: GuildCommunitiesData, discordGuildId: string, userId: string): GuildCommunityRecord | undefined {
  return data.guilds.find((guild) => guild.discordGuildId === discordGuildId && guild.status === "active" && guild.memberIds.includes(userId));
}

export function findOwnedActiveGuild(data: GuildCommunitiesData, discordGuildId: string, ownerId: string): GuildCommunityRecord | undefined {
  return data.guilds.find((guild) => guild.discordGuildId === discordGuildId && guild.status === "active" && guild.ownerId === ownerId);
}

export function pendingGuildRequests(data: GuildCommunitiesData, discordGuildId: string): GuildCommunityRecord[] {
  return data.guilds.filter((guild) => guild.discordGuildId === discordGuildId && guild.status === "pending");
}
