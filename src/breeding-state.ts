import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import type { BreedingPanelState } from "./breeding-types.js";

export function breedingStatePath(rootDir: string): string {
  return path.join(rootDir, "state", "breeding-panel-message.json");
}

export async function readBreedingPanelState(rootDir: string): Promise<BreedingPanelState | null> {
  return readJsonFile<BreedingPanelState | null>(breedingStatePath(rootDir), null);
}

export async function writeBreedingPanelState(rootDir: string, state: BreedingPanelState): Promise<void> {
  await writeJsonAtomic(breedingStatePath(rootDir), state);
}
