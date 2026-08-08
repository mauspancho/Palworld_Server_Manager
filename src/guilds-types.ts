export type GuildCommunityStatus = "pending" | "active" | "rejected" | "cancelled";

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
  reviewChannelId?: string;
  reviewMessageId?: string;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  updatedAt: string;
}

export interface GuildCommunitiesData {
  guilds: GuildCommunityRecord[];
}
