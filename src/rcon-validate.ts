#!/usr/bin/env node
import { booleanEnv, numberEnv, optionalEnv } from "./env-utils.js";
import { sanitizeRconError, TcpRconProbe } from "./rcon-client.js";

async function main(): Promise<void> {
  const enabled = booleanEnv("PALWORLD_RCON_ENABLED", false);
  const password = process.env.PALWORLD_RCON_PASSWORD;
  const client = new TcpRconProbe({
    enabled,
    host: optionalEnv("PALWORLD_RCON_HOST", "127.0.0.1"),
    port: process.env.PALWORLD_RCON_PORT ? numberEnv("PALWORLD_RCON_PORT", 0) : null,
    passwordConfigured: Boolean(password),
    password,
    timeoutMs: 3000,
    allowedCommands: ["Info", "ShowPlayers", "Save"]
  });
  const ok = await client.test();
  console.log(enabled ? `RCON ${ok ? "disponible" : "no disponible"}.` : "RCON desactivado.");
}

main().catch((error: unknown) => {
  console.error(sanitizeRconError(error, process.env.PALWORLD_RCON_PASSWORD));
  process.exitCode = 1;
});
