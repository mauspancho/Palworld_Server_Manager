import type { RoleChangeSet } from "./self-roles-types.js";

export function calculateRoleChanges(
  groupRoleIds: string[],
  currentRoleIds: string[],
  selectedRoleIds: string[],
  protectedRoleIds: string[] = []
): RoleChangeSet {
  const groupSet = new Set(groupRoleIds);
  const currentSet = new Set(currentRoleIds);
  const selectedSet = new Set(selectedRoleIds.filter((roleId) => groupSet.has(roleId)));
  const protectedSet = new Set(protectedRoleIds);

  const addRoleIds = [...selectedSet]
    .filter((roleId) => !currentSet.has(roleId))
    .filter((roleId) => !protectedSet.has(roleId));

  const removeRoleIds = [...groupSet]
    .filter((roleId) => currentSet.has(roleId))
    .filter((roleId) => !selectedSet.has(roleId))
    .filter((roleId) => !protectedSet.has(roleId));

  return { addRoleIds, removeRoleIds };
}
