import fs from "node:fs/promises";
import YAML from "yaml";
import { SafeError } from "./errors.js";
import type { SelfRolesConfig } from "./self-roles-types.js";

const groupIdPattern = /^[a-z0-9_-]{1,40}$/;
const protectedRoleNames = new Set(["Admin", "Palworld Server Manager", "Bots"]);

export async function loadSelfRolesConfig(configPath: string): Promise<SelfRolesConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = YAML.parse(raw) as SelfRolesConfig;
  validateSelfRolesConfig(parsed);
  return parsed;
}

export function validateSelfRolesConfig(config: SelfRolesConfig): void {
  if (!config || !Array.isArray(config.groups) || config.groups.length === 0) {
    throw new SafeError("config/self-roles.yml debe contener al menos un grupo.");
  }
  if (config.groups.length > 5) {
    throw new SafeError("Discord permite maximo 5 menus por mensaje.");
  }

  const groupIds = new Set<string>();
  const roleNames = new Set<string>();
  for (const group of config.groups) {
    if (!group.id || !groupIdPattern.test(group.id)) {
      throw new SafeError(`El grupo "${group.id}" tiene un id invalido.`);
    }
    if (groupIds.has(group.id)) {
      throw new SafeError(`El grupo "${group.id}" esta duplicado.`);
    }
    groupIds.add(group.id);

    if (!group.title || !group.description) {
      throw new SafeError(`El grupo "${group.id}" debe tener titulo y descripcion.`);
    }
    if (!Number.isInteger(group.minValues) || !Number.isInteger(group.maxValues)) {
      throw new SafeError(`El grupo "${group.id}" debe usar minValues y maxValues enteros.`);
    }
    if (!Array.isArray(group.roles) || group.roles.length === 0 || group.roles.length > 25) {
      throw new SafeError(`El grupo "${group.id}" debe tener entre 1 y 25 roles.`);
    }
    if (group.minValues < 0 || group.maxValues < group.minValues || group.maxValues > group.roles.length) {
      throw new SafeError(`El grupo "${group.id}" tiene minValues/maxValues invalidos.`);
    }

    for (const role of group.roles) {
      if (!role.name || !role.description) {
        throw new SafeError(`Todos los roles del grupo "${group.id}" deben tener nombre y descripcion.`);
      }
      if (protectedRoleNames.has(role.name)) {
        throw new SafeError(`El rol protegido "${role.name}" no puede usarse como self-role.`);
      }
      if (roleNames.has(role.name)) {
        throw new SafeError(`El rol "${role.name}" esta duplicado en config/self-roles.yml.`);
      }
      roleNames.add(role.name);
    }
  }
}

export function isProtectedRoleName(roleName: string): boolean {
  return protectedRoleNames.has(roleName);
}
