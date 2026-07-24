#!/usr/bin/env node
import { spawn } from "node:child_process";

const publishScripts = ["roles:publish", "guilds:publish", "status:publish", "tickets:publish"];

async function main(): Promise<void> {
  for (const script of publishScripts) {
    const code = await runNpmScript(script);
    if (code !== 0) {
      console.warn(`Advertencia: ${script} no se completo; continuando con los demas publicadores.`);
    }
  }
}

function runNpmScript(script: string): Promise<number> {
  return new Promise((resolve) => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npmCommand, ["run", script], { stdio: "inherit", shell: false });
    child.once("close", (code) => resolve(code ?? 1));
    child.once("error", () => resolve(1));
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
