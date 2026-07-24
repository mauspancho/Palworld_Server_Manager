import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { SafeError } from "./errors.js";

export interface GuildSlotConfig {
  id: string;
  roleName: string;
  textChannelName: string;
  voiceChannelName: string;
}

export interface GuildsConfig {
  enabled: boolean;
  categoryName: string;
  privateChannels: boolean;
  authorizedRoleNames: string[];
  managerRoleNames: string[];
  guilds: GuildSlotConfig[];
}

export function guildsConfigPath(rootDir: string): string {
  return path.join(rootDir, "config", "guilds.yml");
}

export async function loadGuildsConfig(rootDir: string): Promise<GuildsConfig> {
  const raw = await fs.readFile(guildsConfigPath(rootDir), "utf8");
  const config = YAML.parse(raw) as GuildsConfig;
  validateGuildsConfig(config);
  return config;
}

export function validateGuildsConfig(config: GuildsConfig): void {
  if (!config || !Array.isArray(config.guilds) || config.guilds.length === 0) {
    throw new SafeError("config/guilds.yml debe contener gremios.");
  }
  const ids = new Set<string>();
  const roleNames = new Set<string>();
  for (const guild of config.guilds) {
    if (!guild.id || !guild.roleName || !guild.textChannelName || !guild.voiceChannelName) {
      throw new SafeError("Cada gremio debe tener id, roleName, textChannelName y voiceChannelName.");
    }
    if (ids.has(guild.id)) {
      throw new SafeError(`Gremio duplicado: ${guild.id}.`);
    }
    if (roleNames.has(guild.roleName)) {
      throw new SafeError(`Rol de gremio duplicado: ${guild.roleName}.`);
    }
    ids.add(guild.id);
    roleNames.add(guild.roleName);
  }
}
