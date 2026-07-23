export interface SelfRoleItem {
  name: string;
  description: string;
  emoji?: string;
}

export interface SelfRoleGroup {
  id: string;
  title: string;
  description: string;
  minValues: number;
  maxValues: number;
  roles: SelfRoleItem[];
}

export interface SelfRolesConfig {
  groups: SelfRoleGroup[];
}

export interface SelfRoleMessageState {
  guildId: string;
  channelId: string;
  messageId: string;
  updatedAt: string;
}

export interface ResolvedSelfRole {
  id: string;
  name: string;
  description: string;
  emoji?: string;
}

export interface ResolvedSelfRoleGroup {
  id: string;
  title: string;
  description: string;
  minValues: number;
  maxValues: number;
  roles: ResolvedSelfRole[];
}

export interface RoleChangeSet {
  addRoleIds: string[];
  removeRoleIds: string[];
}
