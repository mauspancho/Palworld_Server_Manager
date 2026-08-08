import type { GuildCommunitiesData, GuildCommunityRecord } from "./guilds-types.js";

export interface UniqueGuildRoleChange {
  addRoleId: string | null;
  removeRoleIds: string[];
}

export interface CreateGuildRequestInput {
  discordGuildId: string;
  ownerId: string;
  name: string;
  memberIds?: string[];
  now?: Date;
}

export function calculateUniqueGuildAssignment(
  allGuildRoleIds: string[],
  currentRoleIds: string[],
  targetRoleId: string | null
): UniqueGuildRoleChange {
  const current = new Set(currentRoleIds);
  const guildRoles = new Set(allGuildRoleIds);
  const removeRoleIds = [...guildRoles].filter((roleId) => current.has(roleId) && roleId !== targetRoleId);
  const addRoleId = targetRoleId && !current.has(targetRoleId) ? targetRoleId : null;
  return { addRoleId, removeRoleIds };
}

export function canUseGuildAdminCommand(memberRoleNames: string[], authorizedRoleNames: string[]): boolean {
  return memberRoleNames.some((roleName) => authorizedRoleNames.includes(roleName));
}

export function normalizeGuildCommunityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function validateGuildCommunityName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 3) {
    return "El nombre del gremio debe tener al menos 3 caracteres.";
  }
  if (trimmed.length > 32) {
    return "El nombre del gremio no puede exceder 32 caracteres.";
  }
  if (/(?:@everyone|@here)/i.test(trimmed)) {
    return "El nombre del gremio no puede incluir menciones globales.";
  }
  return null;
}

export function createGuildRequest(data: GuildCommunitiesData, input: CreateGuildRequestInput): GuildCommunityRecord {
  const nameError = validateGuildCommunityName(input.name);
  if (nameError) {
    throw new Error(nameError);
  }

  const name = input.name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeGuildCommunityName(name);
  const duplicate = data.guilds.find((guild) =>
    guild.discordGuildId === input.discordGuildId
    && guild.normalizedName === normalizedName
    && (guild.status === "pending" || guild.status === "active")
  );
  if (duplicate) {
    throw new Error(`Ya existe una solicitud o gremio activo con el nombre "${name}".`);
  }

  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  return {
    id: createGuildRequestId(name, input.ownerId, now),
    discordGuildId: input.discordGuildId,
    name,
    normalizedName,
    ownerId: input.ownerId,
    memberIds: uniqueGuildMemberIds([input.ownerId, ...(input.memberIds ?? [])]),
    status: "pending",
    createdAt,
    updatedAt: createdAt
  };
}

export function approveGuildRequest(record: GuildCommunityRecord, approverId: string, now = new Date()): GuildCommunityRecord {
  if (record.status !== "pending") {
    throw new Error("Solo se pueden aprobar solicitudes pendientes.");
  }
  const timestamp = now.toISOString();
  return {
    ...record,
    status: "active",
    approvedAt: timestamp,
    approvedBy: approverId,
    updatedAt: timestamp
  };
}

export function rejectGuildRequest(record: GuildCommunityRecord, rejectedBy: string, reason?: string, now = new Date()): GuildCommunityRecord {
  if (record.status !== "pending") {
    throw new Error("Solo se pueden rechazar solicitudes pendientes.");
  }
  const timestamp = now.toISOString();
  return {
    ...record,
    status: "rejected",
    rejectedAt: timestamp,
    rejectedBy,
    rejectionReason: reason?.trim() || undefined,
    updatedAt: timestamp
  };
}

export function cancelGuildRequest(record: GuildCommunityRecord, cancelledBy: string, now = new Date()): GuildCommunityRecord {
  if (record.status !== "pending") {
    throw new Error("Solo se pueden cancelar solicitudes pendientes.");
  }
  const timestamp = now.toISOString();
  return {
    ...record,
    status: "cancelled",
    cancelledAt: timestamp,
    cancelledBy,
    updatedAt: timestamp
  };
}

export function attachGuildReviewMessage(record: GuildCommunityRecord, channelId: string, messageId: string, now = new Date()): GuildCommunityRecord {
  return {
    ...record,
    reviewChannelId: channelId,
    reviewMessageId: messageId,
    updatedAt: now.toISOString()
  };
}

export function addGuildMember(record: GuildCommunityRecord, userId: string, now = new Date()): GuildCommunityRecord {
  return {
    ...record,
    memberIds: uniqueGuildMemberIds([...record.memberIds, userId]),
    updatedAt: now.toISOString()
  };
}

export function removeGuildMember(record: GuildCommunityRecord, userId: string, now = new Date()): GuildCommunityRecord {
  if (userId === record.ownerId) {
    throw new Error("No se puede retirar al lider del gremio.");
  }
  return {
    ...record,
    memberIds: record.memberIds.filter((memberId) => memberId !== userId),
    updatedAt: now.toISOString()
  };
}

export function canManageGuildCommunity(record: GuildCommunityRecord, userId: string, memberRoleNames: string[], adminRoleNames: string[]): boolean {
  return record.ownerId === userId || canUseGuildAdminCommand(memberRoleNames, adminRoleNames);
}

export function guildRoleName(name: string): string {
  return `Gremio - ${name}`;
}

export function guildTextChannelName(name: string): string {
  return `gremio-${slugifyGuildCommunityName(name)}`;
}

export function guildVoiceChannelName(name: string): string {
  return `voz-${slugifyGuildCommunityName(name)}`;
}

function createGuildRequestId(name: string, ownerId: string, now: Date): string {
  return `${slugifyGuildCommunityName(name)}-${ownerId.slice(0, 6)}-${now.getTime().toString(36)}`.slice(0, 64);
}

function slugifyGuildCommunityName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "gremio";
}

function uniqueGuildMemberIds(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
