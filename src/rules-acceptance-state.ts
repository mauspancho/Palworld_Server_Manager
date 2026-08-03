import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import type { RulesAcceptanceData, RulesPanelRecord, RulesPromptRecord } from "./rules-acceptance-types.js";

export function rulesAcceptanceDataPath(rootDir: string): string {
  return path.join(rootDir, "data", "rules-acceptance.json");
}

export async function readRulesAcceptanceData(rootDir: string): Promise<RulesAcceptanceData> {
  return readJsonFile<RulesAcceptanceData>(rulesAcceptanceDataPath(rootDir), { prompts: [] });
}

export async function writeRulesAcceptanceData(rootDir: string, data: RulesAcceptanceData): Promise<void> {
  await writeJsonAtomic(rulesAcceptanceDataPath(rootDir), data);
}

export function findPromptByMessage(data: RulesAcceptanceData, messageId: string): RulesPromptRecord | undefined {
  return data.prompts.find((prompt) => prompt.messageId === messageId);
}

export function findLatestPendingPromptForUser(data: RulesAcceptanceData, guildId: string, userId: string): RulesPromptRecord | undefined {
  return [...data.prompts]
    .reverse()
    .find((prompt) => prompt.guildId === guildId && prompt.userId === userId && prompt.status === "pending");
}

export function findLatestPromptForUser(data: RulesAcceptanceData, guildId: string, userId: string): RulesPromptRecord | undefined {
  return [...data.prompts]
    .reverse()
    .find((prompt) => prompt.guildId === guildId && prompt.userId === userId);
}

export function upsertRulesPrompt(data: RulesAcceptanceData, record: RulesPromptRecord): void {
  const index = data.prompts.findIndex((prompt) => prompt.guildId === record.guildId && prompt.userId === record.userId);
  if (index === -1) {
    data.prompts.push(record);
    return;
  }
  data.prompts[index] = record;
}

export function upsertRulesPanel(data: RulesAcceptanceData, record: RulesPanelRecord): void {
  data.panel = record;
}
