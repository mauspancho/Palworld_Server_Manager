import crypto from "node:crypto";
import type { EncryptedToken } from "./tiktok-types.js";

export function randomTikTokId(prefix = "ttk"): string {
  return `${prefix}_${crypto.randomBytes(18).toString("base64url")}`;
}

export function encryptToken(plainText: string, key: Buffer<ArrayBufferLike>): EncryptedToken {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptToken(token: EncryptedToken, key: Buffer<ArrayBufferLike>): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(token.iv, "base64"));
  decipher.setAuthTag(Buffer.from(token.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(token.ciphertext, "base64")),
    decipher.final()
  ]);
  return plain.toString("utf8");
}

export function maskIdentifier(value: string, visibleStart = 4, visibleEnd = 3): string {
  if (value.length <= visibleStart + visibleEnd) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, visibleStart)}...${value.slice(-visibleEnd)}`;
}
