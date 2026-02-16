import { spawn } from "node:child_process";
import { linkEmailToEstimate } from "@lib/db/repositories/estimate-email";
import { resolveEmailToEstimate } from "@email/resolution/resolve-estimate";
import { resolveEmailToProject } from "@email/resolution/resolve-project";
import type { EstimateResolutionResult } from "@email/resolution/types";
import {
  EMAIL_RESOLVER_ENABLED,
  EMAIL_RESOLVER_SPARK_CONFIDENCE_MIN,
  EMAIL_RESOLVER_SPARK_ENABLED,
  EMAIL_RESOLVER_SPARK_MAX_CANDIDATES,
  EMAIL_RESOLVER_SPARK_MODEL,
  EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS,
  EMAIL_RESOLVER_SPARK_TIMEOUT_MS,
} from "./config";

interface SparkTieBreakChoice {
  estimateId: number;
  confidence: number;
  reason: string;
}

const MARKDOWN_JSON_FENCE_START_RE = /^```(?:json)?/i;
const MARKDOWN_JSON_FENCE_END_RE = /```$/;
const HEADER_LINE_RE = /^>\s+/;
const ANSI_ESCAPE_RE = /\u001B\[[0-9;]*[A-Za-z]/g;
const NULL_BYTE_RE = /\u0000/g;
const OPENCODE_TIMEOUT_RE = /timed out/i;
const OPENCODE_BUN_SCRIPT =
  "/root/.bun/install/global/node_modules/opencode-ai/bin/opencode";

let warnedOpencodeUnavailable = false;

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

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

function parseOpencodeOutput(output: string): Record<string, unknown> | null {
  const clean = stripAnsi(output).trim();
  if (!clean) {
    return null;
  }

  const lines = clean
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (HEADER_LINE_RE.test(line)) {
      continue;
    }
    const parsedLine = parseJsonObject(line);
    if (parsedLine) {
      return parsedLine;
    }
  }

  const body = lines.filter((line) => !HEADER_LINE_RE.test(line)).join("\n");
  return parseJsonObject(body);
}

async function runOpencodePrompt(
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const attempts: { command: string; args: string[] }[] = [
    {
      args: [OPENCODE_BUN_SCRIPT, "run", "-m", EMAIL_RESOLVER_SPARK_MODEL],
      command: "bun",
    },
    {
      args: ["run", "-m", EMAIL_RESOLVER_SPARK_MODEL],
      command: "opencode",
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
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      if (!message.includes("enoent")) {
        break;
      }
    }
  }

  throw lastError ?? new Error("opencode runner failed");
}

async function runOpencodePromptOnce(
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

    const finish = (fn: () => void) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timeout);
      fn();
    };

    const timeout = setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
        // ignore kill errors
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
    proc.on("error", (error) => {
      finish(() => reject(error));
    });
    proc.on("close", (code) => {
      finish(() => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        const errText = stripAnsi(stderr).trim().slice(0, 360);
        reject(new Error(`opencode exit ${code ?? "unknown"}: ${errText}`));
      });
    });

    try {
      proc.stdin.write(prompt.replace(NULL_BYTE_RE, ""));
      proc.stdin.end();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function runSparkEstimateTieBreaker(
  emailId: number,
  resolution: EstimateResolutionResult
): Promise<SparkTieBreakChoice | null> {
  if (!EMAIL_RESOLVER_SPARK_ENABLED || resolution.status !== "ambiguous") {
    return null;
  }

  const { ambiguous } = resolution;
  if (!ambiguous) {
    return null;
  }
  if (ambiguous.candidates.length < 2) {
    return null;
  }

  const candidates = ambiguous.candidates.slice(
    0,
    EMAIL_RESOLVER_SPARK_MAX_CANDIDATES
  );
  const candidateIds = new Set(
    candidates.map((candidate) => candidate.estimateId)
  );
  if (candidates.length < 2) {
    return null;
  }

  const payload = {
    candidates: candidates.map((candidate) => ({
      estimateId: candidate.estimateId,
      estimateNumber: candidate.estimateNumber,
      name: candidate.name,
      jobName: candidate.jobName,
      contractor: candidate.contractor,
      jobAddress: candidate.jobAddress,
      score: candidate.score,
      confidence: candidate.confidence,
      reasons: candidate.reasons,
    })),
    decision: ambiguous.decision,
    email: {
      id: emailId,
      subject: ambiguous.matchResult.context.subject,
      bodyPreview: ambiguous.matchResult.context.bodyPreview.slice(0, 1200),
      attachmentNames: ambiguous.matchResult.context.attachmentNames.slice(
        0,
        12
      ),
      fromDomain: ambiguous.matchResult.context.fromDomain,
      projectHints: ambiguous.matchResult.context.projectHints.slice(0, 12),
      contractorHints: ambiguous.matchResult.context.contractorHints.slice(
        0,
        12
      ),
      addressHints: ambiguous.matchResult.context.addressHints.slice(0, 12),
      estimateReferenceHints:
        ambiguous.matchResult.context.estimateReferenceHints.slice(0, 8),
    },
  };

  const prompt = [
    "You are a strict estimate-link tie-breaker.",
    "Choose only one estimateId from the provided candidates.",
    "If evidence is insufficient, return null estimateId.",
    "Return ONLY valid JSON with keys: estimateId, confidence, reason.",
    "Rules:",
    "- estimateId must be either null or exactly one candidate estimateId.",
    "- confidence must be a number from 0 to 1.",
    "- reason must be short and evidence-based.",
    "",
    JSON.stringify(payload),
  ].join("\n");

  try {
    let output: string;
    try {
      output = await runOpencodePrompt(prompt, EMAIL_RESOLVER_SPARK_TIMEOUT_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetryTimeout =
        OPENCODE_TIMEOUT_RE.test(message) &&
        EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS > EMAIL_RESOLVER_SPARK_TIMEOUT_MS;
      if (!shouldRetryTimeout) {
        throw error;
      }
      console.warn(
        `[email-resolver] spark tie-breaker timeout at ${EMAIL_RESOLVER_SPARK_TIMEOUT_MS}ms; retrying once at ${EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS}ms`
      );
      output = await runOpencodePrompt(
        prompt,
        EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS
      );
    }
    const parsed = parseOpencodeOutput(output);
    if (!parsed) {
      return null;
    }

    const estimateIdRaw = parsed.estimateId;
    const confidenceRaw = parsed.confidence;
    const reasonRaw = parsed.reason;

    if (estimateIdRaw === null) {
      return null;
    }
    if (typeof estimateIdRaw !== "number" || !Number.isInteger(estimateIdRaw)) {
      return null;
    }
    if (!candidateIds.has(estimateIdRaw)) {
      return null;
    }

    const confidence =
      typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : 0;
    if (confidence < EMAIL_RESOLVER_SPARK_CONFIDENCE_MIN) {
      return null;
    }

    return {
      confidence,
      estimateId: estimateIdRaw,
      reason: typeof reasonRaw === "string" ? reasonRaw.slice(0, 280) : "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !warnedOpencodeUnavailable &&
      message.toLowerCase().includes("enoent")
    ) {
      warnedOpencodeUnavailable = true;
      console.warn(
        "[email-resolver] spark fallback unavailable: opencode CLI not found in runtime PATH"
      );
    }
    console.warn(`[email-resolver] spark tie-breaker failed: ${message}`);
    return null;
  }
}

export async function processEmailResolveJob(emailId: number): Promise<void> {
  if (!EMAIL_RESOLVER_ENABLED) {
    return;
  }

  await processEmailResolveJobWithOptions(emailId, { allowSpark: true });
}

interface ProcessEmailResolveOptions {
  allowSpark?: boolean;
}

export async function processEmailResolveJobWithOptions(
  emailId: number,
  options: ProcessEmailResolveOptions = {}
): Promise<void> {
  if (!EMAIL_RESOLVER_ENABLED) {
    return;
  }

  const allowSpark = options.allowSpark ?? true;

  const projectResult = await resolveEmailToProject(emailId, {
    persistReview: true,
    reviewSource: "email_resolver",
  });

  const estimateResult = await resolveEmailToEstimate(emailId, { limit: 6 });
  if (allowSpark && estimateResult.status === "ambiguous") {
    const sparkChoice = await runSparkEstimateTieBreaker(
      emailId,
      estimateResult
    );
    if (sparkChoice) {
      const linked = await linkEmailToEstimate(
        sparkChoice.estimateId,
        emailId,
        "agent",
        `email_resolver spark model=${EMAIL_RESOLVER_SPARK_MODEL} confidence=${sparkChoice.confidence.toFixed(3)} reason=${sparkChoice.reason}`
      );
      if (linked) {
        console.log(
          `[email-resolver] email #${emailId}: linked estimate #${sparkChoice.estimateId} via spark tie-breaker (${sparkChoice.confidence.toFixed(3)})`
        );
        return;
      }
    }
  }

  console.log(
    `[email-resolver] email #${emailId}: project=${projectResult.status} (${projectResult.detail}); estimate=${estimateResult.status} (${estimateResult.detail})`
  );
}
