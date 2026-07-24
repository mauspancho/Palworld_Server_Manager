import type {
  ChannelSnapshot,
  DesiredStructure,
  PlanResult,
  PlannedOperation,
  ServerSnapshot
} from "./domain.js";

const EVERYONE_ROLE_NAME = "@everyone";

export function createPlan(current: ServerSnapshot, desired: DesiredStructure): PlanResult {
  const operations: PlannedOperation[] = [];
  const warnings: string[] = [];
  const categories = current.channels.filter((channel) => channel.type === "category");

  desired.categories.forEach((desiredCategory, categoryIndex) => {
    const currentCategory = categories.find((category) => category.name === desiredCategory.name);

    if (!currentCategory) {
      operations.push({
        kind: "createCategory",
        name: desiredCategory.name,
        position: categoryIndex,
        private: desiredCategory.private === true,
        administrativeRoleNames: desired.administrativeRoleNames
      });
    } else if (desiredCategory.private === true && !hasPrivateAdministrativeOverwrites(current, currentCategory, desired.administrativeRoleNames)) {
      operations.push({
        kind: "updateCategoryPrivacy",
        categoryName: desiredCategory.name,
        administrativeRoleNames: desired.administrativeRoleNames
      });
    }

    desiredCategory.channels.forEach((desiredChannel, channelIndex) => {
      const sameNameChannel = current.channels.find((channel) => channel.name === desiredChannel.name && channel.type !== "category");
      const matchingChannel = sameNameChannel?.type === desiredChannel.type ? sameNameChannel : undefined;

      if (sameNameChannel && sameNameChannel.type !== desiredChannel.type) {
        warnings.push(
          `El canal "${desiredChannel.name}" existe como ${sameNameChannel.type}, pero la configuracion espera ${desiredChannel.type}. No se convertira ni duplicara; corrige manualmente.`
        );
        return;
      }

      if (!matchingChannel) {
        operations.push({
          kind: "createChannel",
          categoryName: desiredCategory.name,
          name: desiredChannel.name,
          channelType: desiredChannel.type,
          position: channelIndex,
          topic: desiredChannel.topic,
          guidelines: desiredChannel.guidelines,
          tags: desiredChannel.tags
        });
        return;
      }

      if (matchingChannel.parentName !== desiredCategory.name) {
        operations.push({
          kind: "moveChannel",
          channelName: desiredChannel.name,
          channelType: desiredChannel.type,
          fromCategoryName: matchingChannel.parentName,
          toCategoryName: desiredCategory.name
        });
      }
    });
  });

  for (const roleName of desired.administrativeRoleNames) {
    if (!current.roles.some((role) => role.name === roleName)) {
      warnings.push(`No existe el rol administrativo "${roleName}". Se omitiran permisos especificos para ese rol hasta que exista.`);
    }
  }

  return { operations, warnings };
}

function hasPrivateAdministrativeOverwrites(
  current: ServerSnapshot,
  category: ChannelSnapshot,
  administrativeRoleNames: string[]
): boolean {
  const everyone = current.roles.find((role) => role.name === EVERYONE_ROLE_NAME);
  const everyoneOverwrite = everyone
    ? category.permissionOverwrites.find((overwrite) => overwrite.type === "role" && overwrite.id === everyone.id)
    : category.permissionOverwrites.find((overwrite) => overwrite.type === "role" && overwrite.name === EVERYONE_ROLE_NAME);

  const deniesEveryoneView = everyoneOverwrite?.deny.includes("ViewChannel") === true;
  if (!deniesEveryoneView) {
    return false;
  }

  const existingAdminRoles = current.roles.filter((role) => administrativeRoleNames.includes(role.name));
  return existingAdminRoles.every((role) => {
    const overwrite = category.permissionOverwrites.find((candidate) => candidate.type === "role" && candidate.id === role.id);
    return overwrite?.allow.includes("ViewChannel") === true;
  });
}
