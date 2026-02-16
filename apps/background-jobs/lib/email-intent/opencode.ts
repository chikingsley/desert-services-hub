import { spawn } from "node:child_process";

interface OpencodeAttempt {
  command: string;
  args: string[];
}

export interface OpencodeOptions {
  model: string;
  timeoutMs: number;
}

const MARKDOWN_JSON_FENCE_START_RE = /^```(?:json)?/i;
const MARKDOWN_JSON_FENCE_END_RE = /```$/;
const HEADER_LINE_RE = /^>\s+/;
const LINES_RE = /\r?\n/;
const ANSI_CSI_PREFIX_RE = /^\[[0-9;]*[A-Za-z]/;
const ESC = String.fromCodePoint(27);

const OPENCODE_BIN_ENV = process.env.OPENCODE_BIN?.trim();

function buildAttempts(model: string): OpencodeAttempt[] {
  const attempts: OpencodeAttempt[] = [];

  if (OPENCODE_BIN_ENV) {
    attempts.push({
      args: ["run", "--print-logs", "-m", model],
      command: OPENCODE_BIN_ENV,
    });
  }

  attempts.push({
    args: ["run", "--print-logs", "-m", model],
    command: "opencode",
  });

  return attempts;
}

function stripAnsi(text: string): string {
  const parts = text.split(ESC);
  if (parts.length === 1) {
    return text;
  }

  let output = parts[0] ?? "";
  for (let i = 1; i < parts.length; i++) {
    output += (parts[i] ?? "").replace(ANSI_CSI_PREFIX_RE, "");
  }
  return output;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
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
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function parseOpencodeOutput(output: string): Record<string, unknown> | null {
  const clean = stripAnsi(output).trim();
  if (!clean) {
    return null;
  }

  const lines = clean
    .split(LINES_RE)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || HEADER_LINE_RE.test(line)) {
      continue;
    }
    const parsed = parseJsonObject(line);
    if (parsed) {
      return parsed;
    }
  }

  const body = lines.filter((line) => !HEADER_LINE_RE.test(line)).join("\n");
  return parseJsonObject(body);
}

async function runOpencodePromptOnce(
  prompt: string,
  attempt: OpencodeAttempt,
  timeoutMs: number
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const sanitizedPrompt = prompt.split("\u0000").join("");
    const proc = spawn(attempt.command, [...attempt.args, sanitizedPrompt], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    const timeout = setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
        // ignore kill failures
      }
      finish(() =>
        reject(new Error(`opencode timed out after ${timeoutMs}ms`))
      );
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    proc.on("error", (error) => finish(() => reject(error)));
    proc.on("close", (code) => {
      finish(() => {
        if (code === 0) {
          resolve([stdout, stderr].filter(Boolean).join("\n"));
          return;
        }
        const errText = stripAnsi(stderr).trim().slice(0, 360);
        reject(new Error(`opencode exit ${code ?? "unknown"}: ${errText}`));
      });
    });

    // no stdin write: prompt is passed as a positional message argument
  });
}

export async function runOpencodeJsonPrompt(
  prompt: string,
  options: OpencodeOptions
): Promise<Record<string, unknown> | null> {
  const attempts = buildAttempts(options.model);
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const output = await runOpencodePromptOnce(
        prompt,
        attempt,
        options.timeoutMs
      );
      const parsed = parseOpencodeOutput(output);
      if (parsed) {
        return parsed;
      }

      const lower = stripAnsi(output).toLowerCase();
      if (lower.includes("usage limit has been reached")) {
        throw new Error("opencode usage limit reached");
      }
      if (lower.includes("model not found")) {
        throw new Error("opencode model not found");
      }
      lastError = new Error("opencode returned no parseable JSON");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("opencode runner failed");
}
