import { Guild, GuildMember, PermissionsBitField } from "discord.js";
import type { BotEnv } from "./bot-config.js";
import type { SelfRolesConfig } from "./self-roles-types.js";
import { isProtectedRoleName } from "./self-roles-config.js";

export interface SelfRolesValidationResult {
  errors: string[];
  warnings: string[];
}

export async function validateExistingSelfRoles(
  guild: Guild,
  botMember: GuildMember,
  env: BotEnv,
  config: SelfRolesConfig
): Promise<SelfRolesValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const managerRole = (await guild.roles.fetch()).find((role) => role.name === "Palworld Server Manager");
  if (!managerRole) {
    errors.push('No existe el rol requerido "Palworld Server Manager".');
    return { errors, warnings };
  }

  const roles = await guild.roles.fetch();
  for (const group of config.groups) {
    for (const configuredRole of group.roles) {
      const matches = roles.filter((role) => role.name === configuredRole.name);
      if (matches.size === 0) {
        warnings.push(`El rol "${configuredRole.name}" aun no existe. roles:publish lo creara.`);
        continue;
      }
      if (matches.size > 1) {
        errors.push(`Hay roles duplicados llamados "${configuredRole.name}" en Discord.`);
        continue;
      }

      const role = matches.first();
      if (!role) {
        continue;
      }
      if (role.id === env.MEMBER_ROLE_ID || isProtectedRoleName(role.name)) {
        errors.push(`El rol protegido "${role.name}" no puede ser self-role.`);
      }
      if (role.managed) {
        errors.push(`El rol "${role.name}" es administrado por una integracion.`);
      }
      if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
        errors.push(`El rol "${role.name}" tiene Administrator.`);
      }
      if (role.position >= managerRole.position) {
        errors.push(`El rol "${role.name}" debe estar debajo de Palworld Server Manager.`);
      }
      if (botMember.roles.highest.comparePositionTo(role) <= 0) {
        errors.push(`El rol mas alto del bot debe estar por encima de "${role.name}".`);
      }
    }
  }

  return { errors, warnings };
}
