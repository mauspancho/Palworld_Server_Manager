import { spawn } from "node:child_process";
import { booleanEnv, optionalEnv } from "./env-utils.js";
import { SafeError } from "./errors.js";

export type PalworldControlAction = "status" | "start" | "stop" | "restart";
const allowedActions = new Set<PalworldControlAction>(["status", "start", "stop", "restart"]);
let operationInProgress = false;

export function isPalworldControlEnabled(): boolean {
  return booleanEnv("PALWORLD_CONTROL_ENABLED", false);
}

export async function runPalworldControl(action: PalworldControlAction): Promise<string> {
  if (!isPalworldControlEnabled()) {
    throw new SafeError("PALWORLD_CONTROL_ENABLED esta desactivado.");
  }
  if (!allowedActions.has(action)) {
    throw new SafeError("Accion de control no permitida.");
  }
  if (operationInProgress) {
    throw new SafeError("Ya hay una operacion de control en curso.");
  }
  operationInProgress = true;
  try {
    return await spawnHelper(optionalEnv("PALWORLD_CONTROL_HELPER", "/usr/local/sbin/palworld-discord-control"), action);
  } finally {
    operationInProgress = false;
  }
}

function spawnHelper(helper: string, action: PalworldControlAction): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(helper, [action], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new SafeError("Timeout ejecutando helper de control."));
    }, 30000);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(stdout.trim()) : reject(new SafeError(stderr.trim() || `Helper finalizo con codigo ${code}.`));
    });
  });
}
