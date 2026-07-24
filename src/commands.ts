#!/usr/bin/env node
import { loadBotEnv, botEnvSecrets } from "./bot-config.js";
import { deleteGuildCommands, listGuildCommands, registerGuildCommands } from "./commands-definitions.js";
import { SafeError, sanitizeSecret, userFacingErrorMessage } from "./errors.js";
import { createContext } from "./paths.js";

const context = createContext();
const action = process.argv[2] ?? "list";

async function main(): Promise<void> {
  const env = loadBotEnv(context.rootDir);
  if (action === "register") {
    const count = await registerGuildCommands(env);
    console.log(`Comandos registrados para el servidor: ${count}.`);
    return;
  }
  if (action === "delete") {
    await deleteGuildCommands(env);
    console.log("Comandos del servidor eliminados.");
    return;
  }
  const commands = await listGuildCommands(env);
  console.log(commands.length > 0 ? commands.join("\n") : "No hay comandos registrados.");
}

main().catch((error: unknown) => {
  const message = error instanceof SafeError ? error.message : userFacingErrorMessage(error);
  console.error(sanitizeSecret(message, botEnvSecrets()));
  process.exitCode = 1;
});
