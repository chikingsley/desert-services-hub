import type {
  PermitIntent,
  PermitIntentModelResult,
  PermitIntentRow,
} from "./permit-intent-types";

export interface PermitIntentRunResult {
  email: PermitIntentRow;
  heuristicIntent: PermitIntent;
  heuristicReason: string;
  model: PermitIntentModelResult | null;
  finalIntent: PermitIntent;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function summarizeCounts<T extends string>(values: T[]): [T, number][] {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].toSorted((a, b) => b[1] - a[1]);
}

export function resolveFinalIntent(
  heuristicIntent: PermitIntent,
  model: PermitIntentModelResult | null
): PermitIntent {
  if (!model) {
    return heuristicIntent;
  }
  if (heuristicIntent === "not_related") {
    return heuristicIntent;
  }
  // Guardrail: do not let model downgrade a permit-signaled row to not_related.
  if (model.intent === "not_related") {
    return heuristicIntent;
  }
  if (model.confidence < 0.85) {
    return heuristicIntent;
  }
  if (heuristicIntent === "other_permit_related") {
    if (model.intent === "other_permit_related") {
      return model.intent;
    }
    return model.confidence >= 0.9 ? model.intent : heuristicIntent;
  }
  if (model.intent === "other_permit_related" && model.confidence < 0.95) {
    return heuristicIntent;
  }
  return model.intent;
}

export function printSummary(
  results: PermitIntentRunResult[],
  llmAnalyzed: number
): void {
  const heuristicCounts = summarizeCounts(
    results.map((r) => r.heuristicIntent)
  );
  const finalCounts = summarizeCounts(results.map((r) => r.finalIntent));
  const compared = results.filter((r) => r.model !== null);
  const disagreements = compared.filter(
    (r) => r.model && r.model.intent !== r.heuristicIntent
  ).length;

  console.log("");
  console.log("Heuristic Intent Counts:");
  for (const [intent, count] of heuristicCounts) {
    console.log(`  ${intent}: ${count}`);
  }

  console.log("");
  console.log("Final Intent Counts (Spark when available):");
  for (const [intent, count] of finalCounts) {
    console.log(`  ${intent}: ${count}`);
  }

  console.log("");
  console.log(
    `Compared rows with Spark: ${llmAnalyzed} | heuristic/model disagreements: ${disagreements}`
  );

  console.log("");
  console.log("Latest Sample (up to 20):");
  for (const row of results.slice(0, 20)) {
    const modelIntent = row.model?.intent ?? "-";
    const confidence =
      row.model && Number.isFinite(row.model.confidence)
        ? row.model.confidence.toFixed(2)
        : "-";
    console.log(
      `  #${row.email.id} | ${row.email.from_email} | h=${row.heuristicIntent} | m=${modelIntent} | c=${confidence} | ${truncate(row.email.subject || "", 90)}`
    );
  }
}
