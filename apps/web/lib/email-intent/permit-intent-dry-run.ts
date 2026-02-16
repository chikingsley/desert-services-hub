import {
  classifyPermitIntentHeuristic,
  classifyPermitIntentWithSpark,
} from "./permit-intent";
import type { LoadPermitIntentCandidatesOptions } from "./permit-intent-candidates";
import { loadPermitIntentCandidates } from "./permit-intent-candidates";
import type { PermitIntentRunResult } from "./permit-intent-report";
import { resolveFinalIntent } from "./permit-intent-report";
import type {
  PermitIntentHeuristic,
  PermitIntentModelResult,
  PermitIntentRow,
} from "./permit-intent-types";

export interface PermitIntentDryRunOptions {
  limit: number;
  sinceDays: number;
  llmLimit: number;
  llmConcurrency: number;
  llmRetries: number;
  timeoutMs: number;
  model: string;
  includeNoiseDomains: boolean;
  skipLlm: boolean;
}

interface DryRunState {
  llmAnalyzed: number;
  llmMax: number;
  opencodeAvailable: boolean;
}

export async function runPermitIntentDryRun(
  opts: PermitIntentDryRunOptions
): Promise<{ results: PermitIntentRunResult[]; llmAnalyzed: number }> {
  const loaderOpts: LoadPermitIntentCandidatesOptions = {
    includeNoiseDomains: opts.includeNoiseDomains,
    limit: opts.limit,
    sinceDays: opts.sinceDays,
  };

  const candidates = await loadPermitIntentCandidates(loaderOpts);
  console.log(`[email-intent-dry-run] candidates loaded=${candidates.length}`);

  const state: DryRunState = {
    llmAnalyzed: 0,
    llmMax: opts.skipLlm ? 0 : Math.min(opts.llmLimit, candidates.length),
    opencodeAvailable: true,
  };
  const results: PermitIntentRunResult[] = [];
  const llmQueue: {
    index: number;
    email: PermitIntentRow;
    heuristic: PermitIntentHeuristic;
  }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const email = candidates[i];
    if (!email) {
      continue;
    }

    const heuristic = classifyPermitIntentHeuristic(email);
    const index = results.push({
      email,
      finalIntent: heuristic.intent,
      heuristicIntent: heuristic.intent,
      heuristicReason: heuristic.reason,
      model: null,
    });

    if (
      !opts.skipLlm &&
      heuristic.intent !== "not_related" &&
      llmQueue.length < state.llmMax
    ) {
      llmQueue.push({ email, heuristic, index: index - 1 });
    }

    if ((i + 1) % 100 === 0 || i + 1 === candidates.length) {
      console.log(
        `[email-intent-dry-run] prepared ${i + 1}/${candidates.length}`
      );
    }
  }

  await classifyQueueWithSpark(llmQueue, results, opts, state);

  for (const result of results) {
    result.finalIntent = resolveFinalIntent(
      result.heuristicIntent,
      result.model
    );
  }

  return {
    llmAnalyzed: results.filter((result) => result.model !== null).length,
    results,
  };
}

async function classifyQueueWithSpark(
  llmQueue: {
    index: number;
    email: PermitIntentRow;
    heuristic: PermitIntentHeuristic;
  }[],
  results: PermitIntentRunResult[],
  opts: PermitIntentDryRunOptions,
  state: DryRunState
): Promise<void> {
  if (llmQueue.length < 1 || opts.skipLlm) {
    return;
  }

  const workerCount = Math.max(
    1,
    Math.min(opts.llmConcurrency, llmQueue.length)
  );
  let cursor = 0;
  let processed = 0;

  const nextTask = () => {
    const task = llmQueue[cursor];
    cursor++;
    return task;
  };

  const worker = async () => {
    while (state.opencodeAvailable) {
      const task = nextTask();
      if (!task) {
        return;
      }

      const model = await classifyWithRetry(
        task.email,
        task.heuristic,
        opts,
        state
      );
      results[task.index].model = model;
      state.llmAnalyzed++;

      processed++;
      if (processed % 25 === 0 || processed === llmQueue.length) {
        console.log(
          `[email-intent-dry-run] spark ${processed}/${llmQueue.length} (workers=${workerCount})`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
}

async function classifyWithRetry(
  email: PermitIntentRow,
  heuristic: PermitIntentHeuristic,
  opts: PermitIntentDryRunOptions,
  state: DryRunState
): Promise<PermitIntentModelResult | null> {
  for (let attempt = 0; attempt <= opts.llmRetries; attempt++) {
    try {
      return await classifyPermitIntentWithSpark(email, heuristic, {
        model: opts.model,
        timeoutMs: opts.timeoutMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      if (lower.includes("enoent")) {
        state.opencodeAvailable = false;
        console.warn(
          "[email-intent-dry-run] opencode unavailable; continuing with heuristics only"
        );
        return null;
      }
      if (lower.includes("usage limit has been reached")) {
        state.opencodeAvailable = false;
        console.warn(
          "[email-intent-dry-run] spark usage limit reached; continuing with heuristics only"
        );
        return null;
      }
      if (lower.includes("opencode usage limit reached")) {
        state.opencodeAvailable = false;
        console.warn(
          "[email-intent-dry-run] spark usage limit reached; continuing with heuristics only"
        );
        return null;
      }

      if (attempt >= opts.llmRetries) {
        console.warn(
          `[email-intent-dry-run] spark classify failed for email #${email.id} after ${attempt + 1} attempt(s): ${message}`
        );
        return null;
      }

      console.warn(
        `[email-intent-dry-run] spark retry ${attempt + 1}/${opts.llmRetries} for email #${email.id}: ${message}`
      );
    }
  }

  return null;
}
