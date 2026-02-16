import { spawn } from "node:child_process";
import { EMAIL_RESOLVER_SPARK_MODEL } from "./config";

const MARKDOWN_JSON_FENCE_START_RE = /^```(?:json)?/i;
const MARKDOWN_JSON_FENCE_END_RE = /```$/;
const HEADER_LINE_RE = /^>\s+/;
const ANSI_ESCAPE_RE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`,
  "g"
);
const OPENCODE_BUN_SCRIPT =
  "/root/.bun/install/global/node_modules/opencode-ai/bin/opencode";
const NL_SPLIT_RE = /\r?\n/;

export interface ParsedOpencodeOutput {
  [key: string]: unknown;
}

function parseJsonObject(text: string): ParsedOpencodeOutput | null {
  if (!text) {
    return null;
  }

  const cleaned = text
    .trim()
    .replace(MARKDOWN_JSON_FENCE_START_RE, "")
    .replace(MARKDOWN_JSON_FENCE_END_RE, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ParsedOpencodeOutput;
    }
  } catch {
    return null;
  }

  return null;
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

export function parseOpencodeOutput(
  output: string
): ParsedOpencodeOutput | null {
  const clean = stripAnsi(output).trim();
  if (!clean) {
    return null;
  }

  const lines = clean.split(NL_SPLIT_RE).map((line) => line.trim());
  const nonEmptyLines = lines.filter((line) => line);

  for (let i = nonEmptyLines.length - 1; i >= 0; i -= 1) {
    const line = nonEmptyLines[i];
    if (line && HEADER_LINE_RE.test(line)) {
      continue;
    }

    const parsed = parseJsonObject(line);
    if (parsed) {
      return parsed;
    }
  }

  const body = nonEmptyLines
    .filter((line) => !HEADER_LINE_RE.test(line))
    .join("\n");
  return parseJsonObject(body);
}

export async function runOpencodePrompt(
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const attempts: Array<{ command: string; args: string[] }> = [
    {
      command: "bun",
      args: [OPENCODE_BUN_SCRIPT, "run", "-m", EMAIL_RESOLVER_SPARK_MODEL],
    },
    {
      command: "opencode",
      args: ["run", "-m", EMAIL_RESOLVER_SPARK_MODEL],
    },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await runOpencodePromptOnce(
        prompt,
        attempt.command,
        attempt.args,
        timeoutMs
      );
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("enoent")) {
        break;
      }
    }
  }

  throw lastError ?? new Error("opencode runner failed");
}

export async function runOpencodePromptOnce(
  prompt: string,
  command: string,
  args: string[],
  timeoutMs: number
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let done = false;

    const timeout = setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
        // ignore kill errors
      }
      finalize(() =>
        reject(new Error(`opencode timed out after ${timeoutMs}ms`))
      );
    }, timeoutMs);

    const finalize = (fn: () => void) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timeout);
      fn();
    };

    proc.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      finalize(() => reject(error));
    });
    proc.on("close", (code) => {
      finalize(() => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        const errText = stderr.trim().slice(0, 360);
        reject(new Error(`opencode exit ${code ?? "unknown"}: ${errText}`));
      });
    });

    try {
      const nullCharPattern = new RegExp(String.fromCharCode(0), "g");
      proc.stdin.write(prompt.replace(nullCharPattern, ""));
      proc.stdin.end();
    } catch (error) {
      finalize(() => reject(error));
    }
  });
}
