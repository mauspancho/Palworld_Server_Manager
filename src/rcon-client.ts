import { Socket } from "node:net";
import { SafeError, sanitizeSecret } from "./errors.js";

export interface RconConfig {
  enabled: boolean;
  host: string;
  port: number | null;
  passwordConfigured: boolean;
  password?: string;
  timeoutMs: number;
  allowedCommands: string[];
}

export interface RconClient {
  test(): Promise<boolean>;
  send(command: string): Promise<string>;
}

export class DisabledRconClient implements RconClient {
  async test(): Promise<boolean> {
    return false;
  }

  async send(): Promise<string> {
    throw new SafeError("RCON esta desactivado.");
  }
}

export class TcpRconProbe implements RconClient {
  constructor(private readonly config: RconConfig) {}

  async test(): Promise<boolean> {
    if (!this.config.enabled || !this.config.port || !this.config.passwordConfigured) {
      return false;
    }
    return await canConnect(this.config.host, this.config.port, this.config.timeoutMs);
  }

  async send(command: string): Promise<string> {
    if (!this.config.allowedCommands.includes(command)) {
      throw new SafeError("Comando RCON no permitido.");
    }
    if (!(await this.test())) {
      throw new SafeError("RCON no disponible.");
    }
    return "RCON conectado; envio administrativo no implementado en esta entrega.";
  }
}

export function sanitizeRconError(error: unknown, password?: string): string {
  return sanitizeSecret(error, [password ?? ""]);
}

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}
