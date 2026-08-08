export type GuildCommunityStatus = "pending" | "active" | "rejected";

export interface GuildCommunityRecord {
  id: string;
  discordGuildId: string;
  name: string;
  normalizedName: string;
  ownerId: string;
  memberIds: string[];
  status: GuildCommunityStatus;
  roleId?: string;
  textChannelId?: string;
  voiceChannelId?: string;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  updatedAt: string;
}

export interface GuildCommunitiesData {
  guilds: GuildCommunityRecord[];
}
