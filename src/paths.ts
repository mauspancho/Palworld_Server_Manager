import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CliContext } from "./domain.js";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));

export function resolveRootDir(): string {
  return process.cwd();
}

export function createContext(rootDir = resolveRootDir()): CliContext {
  return {
    rootDir,
    configPath: path.join(rootDir, "config", "server-structure.yml"),
    backupsDir: path.join(rootDir, "backups"),
    logsDir: path.join(rootDir, "logs")
  };
}

export function resolvePackageRelative(...segments: string[]): string {
  return path.resolve(sourceDir, "..", ...segments);
}
