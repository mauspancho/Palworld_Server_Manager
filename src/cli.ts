#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { loadDesiredStructure, loadEnv } from "./config.js";
import { requireExplicitConfirmation } from "./confirm.js";
import { connectDiscord, closeDiscord, validateBotPermissions } from "./discord-client.js";
import { SafeError, sanitizeSecret } from "./errors.js";
import { printServerSnapshot } from "./list.js";
import { OperationLogger } from "./logger.js";
import { executeOperations, restoreSnapshot } from "./operations.js";
import { createContext } from "./paths.js";
import { createPlan } from "./planner.js";
import { printPlan } from "./plan-printer.js";
import { createSnapshot, writeBackup } from "./snapshot.js";
import type { ServerSnapshot } from "./domain.js";

const command = process.argv[2] ?? "help";
const context = createContext();

async function main(): Promise<void> {
  switch (command) {
    case "validate":
      await withDiscord(async ({ guild, botMember }) => {
        console.log(`Conexion correcta con servidor "${guild.name}" (${guild.id}).`);
        const missing = validateBotPermissions(botMember);
        if (missing.length > 0) {
          throw new SafeError(`El bot no tiene permisos requeridos: ${missing.join(", ")}.`);
        }
        console.log("Permisos requeridos presentes: ManageChannels, ManageRoles, ViewChannel.");
      });
      break;

    case "list":
      await withDiscord(async ({ guild }) => {
        printServerSnapshot(await createSnapshot(guild));
      });
      break;

    case "backup":
      await withDiscord(async ({ guild }) => {
        const filePath = await writeBackup(context.backupsDir, await createSnapshot(guild));
        console.log(`Respaldo creado: ${filePath}`);
      });
      break;

    case "plan":
      await withDiscord(async ({ guild }) => {
        const desired = await loadDesiredStructure(context.configPath);
        const snapshot = await createSnapshot(guild);
        const plan = createPlan(snapshot, desired);
        printPlan(plan);
      });
      break;

    case "apply":
      await withDiscord(async ({ guild }, env) => {
        const desired = await loadDesiredStructure(context.configPath);
        const snapshot = await createSnapshot(guild);
        const backupPath = await writeBackup(context.backupsDir, snapshot, "before-apply");
        console.log(`Respaldo previo creado: ${backupPath}`);
        const plan = createPlan(snapshot, desired);
        printPlan(plan);
        if (plan.operations.length === 0) {
          return;
        }

        await requireExplicitConfirmation("APLICAR", "Estas operaciones modificaran Discord.");
        const logger = new OperationLogger(context.logsDir, [env.DISCORD_BOT_TOKEN]);
        await executeOperations(guild, plan.operations, logger);
        console.log("Operaciones aplicadas.");
      });
      break;

    case "restore":
      await withDiscord(async ({ guild }, env) => {
        const desired = await loadDesiredStructure(context.configPath);
        const backupPath = await resolveRestorePath(process.argv[3]);
        const raw = await fs.readFile(backupPath, "utf8");
        const snapshot = JSON.parse(raw) as ServerSnapshot;
        const safetyBackup = await writeBackup(context.backupsDir, await createSnapshot(guild), "before-restore");
        console.log(`Respaldo previo creado: ${safetyBackup}`);
        console.log(`Respaldo a restaurar: ${backupPath}`);
        await requireExplicitConfirmation("RESTAURAR", "La restauracion creara o ajustara roles y canales, sin eliminar nada.");
        const logger = new OperationLogger(context.logsDir, [env.DISCORD_BOT_TOKEN]);
        await restoreSnapshot(guild, snapshot, desired.protectedRoleNames, logger);
        console.log("Restauracion completada.");
      });
      break;

    case "help":
    default:
      printHelp();
      break;
  }
}

async function withDiscord(
  callback: (
    session: Awaited<ReturnType<typeof connectDiscord>>,
    env: Awaited<ReturnType<typeof loadEnv>>
  ) => Promise<void>
): Promise<void> {
  const env = await loadEnv(context.rootDir);
  const session = await connectDiscord(env);
  try {
    await callback(session, env);
  } finally {
    await closeDiscord(session);
  }
}

async function resolveRestorePath(argument: string | undefined): Promise<string> {
  if (argument) {
    return path.resolve(context.rootDir, argument);
  }

  const entries = await fs.readdir(context.backupsDir);
  const candidates = entries.filter((entry) => entry.endsWith(".json")).sort();
  const latest = candidates.at(-1);
  if (!latest) {
    throw new SafeError("No hay respaldos JSON en backups/. Indica una ruta de respaldo.");
  }

  return path.join(context.backupsDir, latest);
}

function printHelp(): void {
  console.log("Uso: node dist/cli.js <validate|list|backup|plan|apply|restore> [backup.json]");
}

main().catch((error: unknown) => {
  const secrets = [process.env.DISCORD_BOT_TOKEN ?? ""];
  const message = error instanceof SafeError
    ? error.message
    : error instanceof Error
      ? sanitizeSecret(error.message, secrets)
      : sanitizeSecret(error, secrets);
  console.error(message);
  process.exitCode = 1;
});
