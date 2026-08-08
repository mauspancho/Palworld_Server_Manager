import { PermissionFlagsBits, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";
import { adminOrModeratorRoleNames, adminRoleNames } from "./command-permissions.js";

export type CommandAccessLevel =
  | "public"
  | "member"
  | "moderator"
  | "administrator";

export const commandAccessLevels: Record<string, CommandAccessLevel> = {
  crianza: "public",
  estado: "public",
  sugerencia: "public",
  vincular: "public",
  gremio: "public",
  evento: "moderator",
  cuarentena: "moderator",
  palworld: "administrator",
  informacion: "administrator",
  "crianza-panel": "administrator"
};

export function commandAccessLevel(commandName: string): CommandAccessLevel {
  return commandAccessLevels[commandName] ?? "administrator";
}

export function defaultMemberPermissionsForAccess(level: CommandAccessLevel): string | null {
  if (level === "administrator") {
    return PermissionFlagsBits.Administrator.toString();
  }
  if (level === "moderator") {
    return PermissionFlagsBits.ManageMessages.toString();
  }
  return null;
}

export function roleNamesForAccess(level: CommandAccessLevel): string[] {
  if (level === "administrator") {
    return adminRoleNames();
  }
  if (level === "moderator") {
    return adminOrModeratorRoleNames();
  }
  return [];
}

export function applyDefaultCommandPermissions(
  command: RESTPostAPIChatInputApplicationCommandsJSONBody
): RESTPostAPIChatInputApplicationCommandsJSONBody {
  const permissions = defaultMemberPermissionsForAccess(commandAccessLevel(command.name));
  if (permissions === null) {
    return command;
  }
  return {
    ...command,
    default_member_permissions: permissions
  };
}

export function publicCommandNames(): string[] {
  return Object.entries(commandAccessLevels)
    .filter(([, level]) => level === "public" || level === "member")
    .map(([name]) => name)
    .sort();
}

export function restrictedCommandNames(): string[] {
  return Object.entries(commandAccessLevels)
    .filter(([, level]) => level === "moderator" || level === "administrator")
    .map(([name]) => name)
    .sort();
}
