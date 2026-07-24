import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import { emptyTicketsData } from "./tickets-logic.js";
import type { TicketsData } from "./tickets-types.js";

export function ticketsDataPath(rootDir: string): string {
  return path.join(rootDir, "data", "tickets.json");
}

export function transcriptsDir(rootDir: string): string {
  return path.join(rootDir, "transcripts");
}

export async function readTicketsData(rootDir: string): Promise<TicketsData> {
  return readJsonFile<TicketsData>(ticketsDataPath(rootDir), emptyTicketsData());
}

export async function writeTicketsData(rootDir: string, data: TicketsData): Promise<void> {
  await writeJsonAtomic(ticketsDataPath(rootDir), data);
}
