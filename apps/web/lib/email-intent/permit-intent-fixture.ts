import {
  classifyPermitIntentHeuristic,
  classifyPermitIntentWithSpark,
} from "./permit-intent";
import type { PermitIntent, PermitIntentRow } from "./permit-intent-types";

export interface PermitIntentFixtureCase {
  id: string;
  fromEmail: string;
  fromDomain: string;
  subject: string;
  bodyPreview: string;
  attachmentNames?: string;
  expectedHeuristicIntent: PermitIntent;
  expectedHasPermitSignal: boolean;
  acceptedModelIntents?: PermitIntent[];
}

export interface PermitIntentFixtureFile {
  version: string;
  description: string;
  cases: PermitIntentFixtureCase[];
}

export interface PermitIntentFixtureCheckOptions {
  model: string;
  timeoutMs: number;
  skipLlm: boolean;
  llmLimit: number;
}

export interface PermitIntentFixtureCaseResult {
  id: string;
  expectedHeuristicIntent: PermitIntent;
  actualHeuristicIntent: PermitIntent;
  expectedHasPermitSignal: boolean;
  actualHasPermitSignal: boolean;
  heuristicPass: boolean;
  modelIntent: PermitIntent | null;
  modelConfidence: number | null;
  modelPass: boolean | null;
}

export interface PermitIntentFixtureRunStats {
  modelChecked: number;
  modelPasses: number;
}

function toRow(row: PermitIntentFixtureCase, idx: number): PermitIntentRow {
  return {
    attachment_names: row.attachmentNames ?? null,
    body_preview: row.bodyPreview,
    classification: null,
    conversation_id: null,
    from_domain: row.fromDomain,
    from_email: row.fromEmail,
    id: idx + 1,
    project_id: null,
    received_at: "2026-02-13T00:00:00.000Z",
    subject: row.subject,
  };
}

function shouldRunModelCheck(
  c: PermitIntentFixtureCase,
  opts: PermitIntentFixtureCheckOptions,
  stats: PermitIntentFixtureRunStats
): boolean {
  if (opts.skipLlm) {
    return false;
  }
  if (c.expectedHeuristicIntent === "not_related") {
    return false;
  }
  return stats.modelChecked < opts.llmLimit;
}

export async function evaluateFixtureCase(
  c: PermitIntentFixtureCase,
  idx: number,
  opts: PermitIntentFixtureCheckOptions,
  stats: PermitIntentFixtureRunStats
): Promise<PermitIntentFixtureCaseResult> {
  const row = toRow(c, idx);
  const heuristic = classifyPermitIntentHeuristic(row);
  const heuristicPass =
    heuristic.intent === c.expectedHeuristicIntent &&
    heuristic.hasPermitSignal === c.expectedHasPermitSignal;

  let modelIntent: PermitIntent | null = null;
  let modelConfidence: number | null = null;
  let modelPass: boolean | null = null;

  if (shouldRunModelCheck(c, opts, stats)) {
    const model = await classifyPermitIntentWithSpark(row, heuristic, {
      model: opts.model,
      timeoutMs: opts.timeoutMs,
    });
    modelIntent = model?.intent ?? null;
    modelConfidence = model?.confidence ?? null;
    const accepted = c.acceptedModelIntents ?? [c.expectedHeuristicIntent];
    modelPass = Boolean(model && accepted.includes(model.intent));
    stats.modelChecked++;
    if (modelPass) {
      stats.modelPasses++;
    }
  }

  return {
    actualHasPermitSignal: heuristic.hasPermitSignal,
    actualHeuristicIntent: heuristic.intent,
    expectedHasPermitSignal: c.expectedHasPermitSignal,
    expectedHeuristicIntent: c.expectedHeuristicIntent,
    heuristicPass,
    id: c.id,
    modelConfidence,
    modelIntent,
    modelPass,
  };
}
