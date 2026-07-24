export type DesiredChannelType = "text" | "voice" | "forum";
export type SnapshotChannelType = "category" | "text" | "voice" | "forum";
export type PermissionOverwriteType = "role" | "member";

export interface DesiredChannel {
  name: string;
  type: DesiredChannelType;
  topic?: string;
  guidelines?: string;
  tags?: string[];
}

export interface DesiredCategory {
  name: string;
  private?: boolean;
  channels: DesiredChannel[];
}

export interface DesiredStructure {
  protectedRoleNames: string[];
  administrativeRoleNames: string[];
  categories: DesiredCategory[];
}

export interface PermissionOverwriteSnapshot {
  id: string;
  type: PermissionOverwriteType;
  name?: string;
  allow: string[];
  deny: string[];
}

export interface RoleSnapshot {
  id: string;
  name: string;
  position: number;
  color: number;
  hoist: boolean;
  managed: boolean;
  mentionable: boolean;
  permissions: string[];
}

export interface ChannelSnapshot {
  id: string;
  name: string;
  type: SnapshotChannelType;
  position: number;
  parentId: string | null;
  parentName: string | null;
  permissionOverwrites: PermissionOverwriteSnapshot[];
  topic?: string | null;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  availableTags?: string[];
}

export interface ServerSnapshot {
  schemaVersion: 1;
  guildId: string;
  guildName: string;
  createdAt: string;
  roles: RoleSnapshot[];
  channels: ChannelSnapshot[];
}

export interface CreateCategoryOperation {
  kind: "createCategory";
  name: string;
  position: number;
  private: boolean;
  administrativeRoleNames: string[];
}

export interface CreateChannelOperation {
  kind: "createChannel";
  categoryName: string;
  name: string;
  channelType: DesiredChannelType;
  position: number;
  topic?: string;
  guidelines?: string;
  tags?: string[];
}

export interface MoveChannelOperation {
  kind: "moveChannel";
  channelName: string;
  channelType: DesiredChannelType;
  fromCategoryName: string | null;
  toCategoryName: string;
}

export interface UpdateCategoryPrivacyOperation {
  kind: "updateCategoryPrivacy";
  categoryName: string;
  administrativeRoleNames: string[];
}

export type PlannedOperation =
  | CreateCategoryOperation
  | CreateChannelOperation
  | MoveChannelOperation
  | UpdateCategoryPrivacyOperation;

export interface PlanResult {
  operations: PlannedOperation[];
  warnings: string[];
}

export interface CliContext {
  rootDir: string;
  configPath: string;
  backupsDir: string;
  logsDir: string;
}
