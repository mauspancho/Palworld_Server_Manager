import type { PalworldStatusConfig } from "./status-types.js";
import { booleanEnv, numberEnv, optionalEnv } from "./env-utils.js";
import { SafeError } from "./errors.js";

const serviceNamePattern = /^[A-Za-z0-9_.@:-]+\.service$/;

export function loadStatusConfig(): PalworldStatusConfig {
  const serviceName = optionalEnv("PALWORLD_SERVICE_NAME", "palworld.service");
  validateServiceName(serviceName);
  return {
    enabled: booleanEnv("PALWORLD_STATUS_ENABLED", true),
    serviceName,
    host: optionalEnv("PALWORLD_HOST", "127.0.0.1"),
    gamePort: numberEnv("PALWORLD_GAME_PORT", 8211),
    rconEnabled: booleanEnv("PALWORLD_RCON_ENABLED", false),
    rconHost: optionalEnv("PALWORLD_RCON_HOST", "127.0.0.1"),
    rconPort: process.env.PALWORLD_RCON_PORT ? numberEnv("PALWORLD_RCON_PORT", 0) : null,
    rconPasswordConfigured: Boolean(process.env.PALWORLD_RCON_PASSWORD),
    intervalSeconds: Math.max(15, numberEnv("PALWORLD_STATUS_INTERVAL_SECONDS", 60)),
    statusChannelId: optionalEnv("PALWORLD_STATUS_CHANNEL_ID"),
    alertChannelId: optionalEnv("PALWORLD_ALERT_CHANNEL_ID")
  };
}

export function validateServiceName(serviceName: string): void {
  if (!serviceNamePattern.test(serviceName)) {
    throw new SafeError("PALWORLD_SERVICE_NAME tiene un formato invalido.");
  }
}
