import crypto from "node:crypto";

export interface PlayerLinkRecord {
  discordId: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "verified" | "expired";
}

export function createLinkCode(discordId: string, now = new Date()): { code: string; record: PlayerLinkRecord } {
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  return {
    code,
    record: {
      discordId,
      codeHash: hashLinkCode(code),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "pending"
    }
  };
}

export function hashLinkCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function isLinkExpired(record: PlayerLinkRecord, now = new Date()): boolean {
  return new Date(record.expiresAt).getTime() <= now.getTime();
}
