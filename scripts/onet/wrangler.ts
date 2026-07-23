import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface WranglerResult {
  stdout: string;
  stderr: string;
}

export async function runWrangler(args: string[], logPath?: string): Promise<WranglerResult> {
  const command = ["bunx", "wrangler", ...args];
  const process = Bun.spawn(command, {
    stdout: "pipe",
    stderr: "pipe",
    env: processEnv(),
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (logPath) {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(
      logPath,
      `$ ${command.map(shellWord).join(" ")}\n${redact(stdout)}${redact(stderr)}\n`,
    );
  }
  if (exitCode !== 0) {
    throw new Error(`Wrangler exited with code ${exitCode}: ${redact(stderr || stdout).slice(-2_000)}`);
  }
  return { stdout, stderr };
}

export function parseD1Rows(stdout: string): Record<string, unknown>[] {
  const parsed = parseJsonPayload(stdout);
  const arrays: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of arrays) {
    if (!item || typeof item !== "object") continue;
    const result = item as Record<string, unknown>;
    if (Array.isArray(result.results)) return result.results.filter(isObject) as Record<string, unknown>[];
    if (result.result && typeof result.result === "object") {
      const nested = result.result as Record<string, unknown>;
      if (Array.isArray(nested.results)) return nested.results.filter(isObject) as Record<string, unknown>[];
    }
  }
  return [];
}

function parseJsonPayload(stdout: string): unknown {
  const lines = stdout.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const firstLine = lines[index]?.trimStart() ?? "";
    if (!firstLine.startsWith("[") && !firstLine.startsWith("{")) continue;
    const candidate = [firstLine, ...lines.slice(index + 1)].join("\n").trim();
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Wrangler may emit progress lines before its JSON payload; try the next JSON-looking line.
    }
  }
  throw new Error("Wrangler output did not contain a valid JSON payload.");
}

function processEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function shellWord(value: string): string {
  return /^[a-zA-Z0-9_./:=@-]+$/.test(value) ? value : JSON.stringify(value);
}

function redact(value: string): string {
  let redacted = value;
  for (const key of ["CLOUDFLARE_API_TOKEN", "GPT_API_KEY"]) {
    const secret = process.env[key];
    if (secret) redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
