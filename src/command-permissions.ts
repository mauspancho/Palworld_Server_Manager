import type { GuildMember, Role } from "discord.js";

export function memberHasAnyRole(member: GuildMember, allowedRoleNames: string[]): boolean {
  return member.roles.cache.some((role: Role) => allowedRoleNames.includes(role.name));
}

export function adminRoleNames(): string[] {
  return ["Admin"];
}

export function adminOrModeratorRoleNames(): string[] {
  return ["Admin", "Moderador"];
}
