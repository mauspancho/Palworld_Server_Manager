import fs from "node:fs/promises";
import path from "node:path";
import type { SelfRoleMessageState } from "./self-roles-types.js";

export function selfRolesConfigPath(rootDir: string): string {
  return path.join(rootDir, "config", "self-roles.yml");
}

export function selfRolesStateDir(rootDir: string): string {
  return path.join(rootDir, "state");
}

export function selfRolesMessageStatePath(rootDir: string): string {
  return path.join(selfRolesStateDir(rootDir), "self-roles-message.json");
}

export async function readSelfRolesMessageState(rootDir: string): Promise<SelfRoleMessageState | null> {
  const statePath = selfRolesMessageStatePath(rootDir);
  const raw = await fs.readFile(statePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });
  return raw ? JSON.parse(raw) as SelfRoleMessageState : null;
}

export async function writeSelfRolesMessageState(rootDir: string, state: SelfRoleMessageState): Promise<void> {
  await fs.mkdir(selfRolesStateDir(rootDir), { recursive: true });
  await fs.writeFile(selfRolesMessageStatePath(rootDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
