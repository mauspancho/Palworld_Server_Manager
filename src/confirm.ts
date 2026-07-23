import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function requireExplicitConfirmation(expected: string, prompt: string): Promise<void> {
  const readline = createInterface({ input, output });
  try {
    const answer = await readline.question(`${prompt}\nEscribe ${expected} para confirmar: `);
    if (answer.trim() !== expected) {
      throw new Error("Confirmacion cancelada.");
    }
  } finally {
    readline.close();
  }
}
