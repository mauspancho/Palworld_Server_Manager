import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeSecret } from "./errors.js";

export class OperationLogger {
  constructor(
    private readonly logsDir: string,
    private readonly secrets: string[] = []
  ) {}

  async log(message: string, details?: unknown): Promise<void> {
    await fs.mkdir(this.logsDir, { recursive: true });
    const fileName = `${new Date().toISOString().slice(0, 10)}.log`;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      message: sanitizeSecret(message, this.secrets),
      details: details === undefined ? undefined : sanitizeSecret(JSON.stringify(details), this.secrets)
    });
    await fs.appendFile(path.join(this.logsDir, fileName), `${line}\n`, "utf8");
  }
}
