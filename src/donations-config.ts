import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import {
  defaultDonationsMessageConfig,
  normalizeDonationsMessageConfig,
  validateDonationsMessageConfig,
  type DonationsMessageConfig
} from "./donations-panel.js";
import { SafeError } from "./errors.js";

export function donationsMessageConfigPath(rootDir: string): string {
  return path.join(rootDir, "data", "donations-message-config.json");
}

export async function readDonationsMessageConfig(rootDir: string): Promise<DonationsMessageConfig> {
  const stored = await readJsonFile<Partial<DonationsMessageConfig> | null>(donationsMessageConfigPath(rootDir), null).catch((error) => {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  });
  if (!stored?.title || !stored?.body) {
    return defaultDonationsMessageConfig;
  }
  const normalized = normalizeDonationsMessageConfig(stored.title, stored.body);
  const errors = validateDonationsMessageConfig(normalized.title, normalized.body);
  return errors.length === 0 ? normalized : defaultDonationsMessageConfig;
}

export async function writeDonationsMessageConfig(rootDir: string, title: string, body: string): Promise<DonationsMessageConfig> {
  const normalized = normalizeDonationsMessageConfig(title, body);
  const errors = validateDonationsMessageConfig(normalized.title, normalized.body);
  if (errors.length > 0) {
    throw new SafeError(errors.join("\n"));
  }
  await writeJsonAtomic(donationsMessageConfigPath(rootDir), normalized);
  return normalized;
}
