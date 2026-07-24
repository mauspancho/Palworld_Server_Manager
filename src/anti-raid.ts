export interface RaidRuleConfig {
  enabled: boolean;
  joinThreshold: number;
  windowSeconds: number;
  minAccountAgeHours: number;
}

export interface JoinEventRecord {
  userId: string;
  joinedAt: number;
  accountCreatedAt: number;
}

export interface RaidDetection {
  triggered: boolean;
  reasons: string[];
}

export function detectRaidRisk(events: JoinEventRecord[], config: RaidRuleConfig, now = Date.now()): RaidDetection {
  if (!config.enabled) {
    return { triggered: false, reasons: [] };
  }
  const windowMs = config.windowSeconds * 1000;
  const recent = events.filter((event) => now - event.joinedAt <= windowMs);
  const reasons: string[] = [];
  if (recent.length >= config.joinThreshold) {
    reasons.push(`Entradas recientes: ${recent.length}/${config.joinThreshold}.`);
  }
  const minAgeMs = config.minAccountAgeHours * 60 * 60 * 1000;
  if (recent.some((event) => now - event.accountCreatedAt < minAgeMs)) {
    reasons.push("Cuenta demasiado nueva detectada.");
  }
  return { triggered: reasons.length > 0, reasons };
}
