import type { PalworldStatusConfig, PalworldStatusSnapshot, ServiceStatus } from "./status-types.js";
import { safeExecFile } from "./safe-exec.js";

export interface StatusProbe {
  probe(config: PalworldStatusConfig): Promise<PalworldStatusSnapshot>;
}

export class SystemStatusProbe implements StatusProbe {
  async probe(config: PalworldStatusConfig): Promise<PalworldStatusSnapshot> {
    if (process.platform === "win32") {
      return fallbackSnapshot(config, "unknown");
    }

    const active = await safeExecFile("systemctl", ["is-active", config.serviceName], 4000);
    const show = await safeExecFile("systemctl", ["show", config.serviceName, "--property=ActiveEnterTimestamp,MainPID,MemoryCurrent"], 4000);
    const port = await safeExecFile("ss", ["-lun"], 4000);
    const properties = parseSystemctlShow(show.stdout);
    const status = mapSystemdStatus(active.stdout.trim(), active.ok);

    return {
      status: port.stdout.includes(`:${config.gamePort} `) && status === "online" ? "online" : status,
      serviceName: config.serviceName,
      port: config.gamePort,
      uptime: properties.ActiveEnterTimestamp ?? "desconocido",
      mainPid: properties.MainPID ?? "desconocido",
      memory: formatMemory(properties.MemoryCurrent),
      players: config.rconEnabled && config.rconPort && config.rconPasswordConfigured ? "RCON configurado" : "RCON no configurado",
      rcon: config.rconEnabled && config.rconPort && config.rconPasswordConfigured ? "unavailable" : "disabled",
      checkedAt: new Date().toISOString()
    };
  }
}

export function parseSystemctlShow(output: string): Record<string, string> {
  return Object.fromEntries(output.split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf("=");
    return index === -1 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
  }));
}

export function mapSystemdStatus(value: string, ok: boolean): ServiceStatus {
  if (!ok && value === "failed") {
    return "failed";
  }
  if (value === "active") {
    return "online";
  }
  if (value === "activating") {
    return "starting";
  }
  if (value === "failed") {
    return "failed";
  }
  if (value === "inactive" || value === "deactivating") {
    return "offline";
  }
  return "unknown";
}

export function shouldSendStatusAlert(previous: ServiceStatus | undefined, next: ServiceStatus): boolean {
  if (!previous || previous === next) {
    return false;
  }
  if (next === "failed") {
    return true;
  }
  return (previous === "online" && next === "offline") || (previous === "offline" && next === "online");
}

function fallbackSnapshot(config: PalworldStatusConfig, status: ServiceStatus): PalworldStatusSnapshot {
  return {
    status,
    serviceName: config.serviceName,
    port: config.gamePort,
    uptime: "no disponible en Windows",
    memory: "no disponible",
    mainPid: "no disponible",
    players: "RCON no configurado",
    rcon: "disabled",
    checkedAt: new Date().toISOString()
  };
}

function formatMemory(value: string | undefined): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "desconocida";
  }
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
