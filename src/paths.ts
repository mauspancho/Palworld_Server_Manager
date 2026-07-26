import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CliContext } from "./domain.js";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(sourceDir, "..");

export function resolveRootDir(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json")) && fs.existsSync(path.join(cwd, "config"))) {
    return cwd;
  }
  return packageRoot;
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
