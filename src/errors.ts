export class SafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeError";
  }
}

export function sanitizeSecret(input: unknown, secrets: string[] = []): string {
  let text = input instanceof Error ? input.stack ?? input.message : String(input);
  for (const secret of secrets) {
    if (secret) {
      text = text.split(secret).join("[REDACTED]");
    }
  }
  return text.replace(/Bot\s+[A-Za-z0-9._-]+/g, "Bot [REDACTED]");
}

export function userFacingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Used disallowed intents")) {
    return "Discord rechazo los Gateway Intents configurados. Habilita Server Members Intent para este bot en Discord Developer Portal y vuelve a ejecutar bot:validate.";
  }
  return message;
}
