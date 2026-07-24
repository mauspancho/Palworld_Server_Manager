export interface UniqueGuildRoleChange {
  addRoleId: string | null;
  removeRoleIds: string[];
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
