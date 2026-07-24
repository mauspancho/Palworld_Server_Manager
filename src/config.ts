import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import YAML from "yaml";
import type { DesiredStructure } from "./domain.js";
import { SafeError } from "./errors.js";

export interface RuntimeEnv {
  DISCORD_BOT_TOKEN: string;
  DISCORD_GUILD_ID: string;
}

export async function loadEnv(rootDir: string): Promise<RuntimeEnv> {
  dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) {
    throw new SafeError("Faltan DISCORD_BOT_TOKEN o DISCORD_GUILD_ID en .env.");
  }

  return {
    DISCORD_BOT_TOKEN: token,
    DISCORD_GUILD_ID: guildId
  };
}

export async function loadDesiredStructure(configPath: string): Promise<DesiredStructure> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = YAML.parse(raw) as DesiredStructure;
  validateDesiredStructure(parsed);
  return parsed;
}

function validateDesiredStructure(value: DesiredStructure): void {
  if (!value || !Array.isArray(value.categories)) {
    throw new SafeError("config/server-structure.yml no contiene una lista valida de categorias.");
  }
  value.protectedRoleNames ??= [];
  value.administrativeRoleNames ??= [];

  for (const category of value.categories) {
    if (!category.name || !Array.isArray(category.channels)) {
      throw new SafeError(`Categoria invalida en configuracion: ${JSON.stringify(category)}`);
    }
    for (const channel of category.channels) {
      if (!channel.name || (channel.type !== "text" && channel.type !== "voice" && channel.type !== "forum")) {
        throw new SafeError(`Canal invalido en categoria ${category.name}.`);
      }
      if (channel.tags && (!Array.isArray(channel.tags) || channel.tags.some((tag) => typeof tag !== "string" || tag.length === 0))) {
        throw new SafeError(`Etiquetas invalidas en canal ${channel.name}.`);
      }
    }
  }
}
