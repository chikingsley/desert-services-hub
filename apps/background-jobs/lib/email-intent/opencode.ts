import { spawn } from "node:child_process";

interface OpencodeAttempt {
  command: string;
  args: string[];
}

export interface OpencodeOptions {
  model: string;
  timeoutMs: number;
}

const MARKDOWN_JSON_FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/;
const LINES_RE = /\r?\n/;

const OPENCODE_BIN_ENV = process.env.OPENCODE_BIN?.trim();

function buildAttempts(model: string): OpencodeAttempt[] {
  const attempts: OpencodeAttempt[] = [];

  if (OPENCODE_BIN_ENV) {
    attempts.push({
      args: ["run", "--format", "json", "-m", model],
      command: OPENCODE_BIN_ENV,
    });
  }

  attempts.push({
    args: ["run", "--format", "json", "-m", model],
    command: "opencode",
  });

  return attempts;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text) {
    return null;
  }

  // Strip markdown fences if present
  const fenceMatch = MARKDOWN_JSON_FENCE_RE.exec(text);
  const cleaned = (fenceMatch ? fenceMatch[1] : text).trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON
  }

  return null;
}

/**
 * Extract text content from opencode JSON event stream.
 *
 * With --format json, stdout is newline-delimited JSON events like:
 *   {"type":"text","part":{"text":"..."}}
 *   {"type":"step_start",...}
 *   {"type":"step_finish",...}
 *
 * We collect all "text" type events and concatenate their text content.
 */
function extractTextFromJsonEvents(output: string): string {
  const textParts: string[] = [];

  for (const line of output.split(LINES_RE)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const event = JSON.parse(trimmed);
      if (event?.type === "text" && event?.part?.text) {
        textParts.push(event.part.text);
      }
    } catch {
      // Not a JSON event line, skip
    }
  }

  return textParts.join("");
}

function parseOpencodeOutput(output: string): Record<string, unknown> | null {
  // First try extracting from JSON event stream (--format json)
  const extractedText = extractTextFromJsonEvents(output);
  if (extractedText) {
    const parsed = parseJsonObject(extractedText);
    if (parsed) {
      return parsed;
    }
  }

  // Fallback: try parsing the raw output directly (handles non-event formats)
  return parseJsonObject(output.trim());
}

function runOpencodePromptOnce(
  prompt: string,
  attempt: OpencodeAttempt,
  timeoutMs: number
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const sanitizedPrompt = prompt.split("\u0000").join("");
    // Pipe prompt via stdin to avoid E2BIG on large contexts
    const proc = spawn(attempt.command, attempt.args, {
      stdio: ["pipe", "pipe", "pipe"],
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
          resolve(stdout);
          return;
        }
        const errText = stderr.trim().slice(0, 360);
        reject(new Error(`opencode exit ${code ?? "unknown"}: ${errText}`));
      });
    });

    // Write prompt to stdin — avoids OS ARG_MAX limit
    proc.stdin.write(sanitizedPrompt);
    proc.stdin.end();
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

      const lower = output.toLowerCase();
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
