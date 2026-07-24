import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import type { StatusMessageState } from "./status-types.js";

export function statusStatePath(rootDir: string): string {
  return path.join(rootDir, "state", "palworld-status-message.json");
}

export async function readStatusState(rootDir: string): Promise<StatusMessageState | null> {
  return readJsonFile<StatusMessageState | null>(statusStatePath(rootDir), null);
}

export async function writeStatusState(rootDir: string, state: StatusMessageState): Promise<void> {
  await writeJsonAtomic(statusStatePath(rootDir), state);
}
