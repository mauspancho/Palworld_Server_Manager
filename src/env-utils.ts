export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function booleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function csvEnv(name: string, fallback: string[] = []): string[] {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
