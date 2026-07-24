import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function safeExecFile(file: string, args: string[], timeoutMs = 5000): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  try {
    const result = await execFileAsync(file, args, { timeout: timeoutMs, windowsHide: true });
    return { stdout: result.stdout, stderr: result.stderr, ok: true };
  } catch (error) {
    const output = error as { stdout?: string; stderr?: string };
    return { stdout: output.stdout ?? "", stderr: output.stderr ?? "", ok: false };
  }
}
