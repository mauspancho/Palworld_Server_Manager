export type ServiceStatus = "online" | "offline" | "starting" | "failed" | "unknown";

export interface PalworldStatusConfig {
  enabled: boolean;
  serviceName: string;
  host: string;
  gamePort: number;
  rconEnabled: boolean;
  rconHost: string;
  rconPort: number | null;
  rconPasswordConfigured: boolean;
  intervalSeconds: number;
  statusChannelId: string;
  alertChannelId: string;
}

export interface PalworldStatusSnapshot {
  status: ServiceStatus;
  serviceName: string;
  port: number;
  uptime: string;
  memory: string;
  mainPid: string;
  players: string;
  rcon: "disabled" | "ok" | "unavailable";
  checkedAt: string;
}

export interface StatusMessageState {
  guildId: string;
  channelId: string;
  messageId: string;
  lastStatus?: ServiceStatus;
  rconFailures?: number;
  updatedAt: string;
}
