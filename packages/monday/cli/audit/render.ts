import type { AuditResult, BucketKey } from "./chains";

function pct(value: number, total: number): string {
  if (total === 0) {
    return "0.00%";
  }
  return `${((value / total) * 100).toFixed(2)}%`;
}

export function formatBucketCounts(
  counts: Record<BucketKey, number>,
  total: number
): string[] {
  return [
    `  direct:            ${String(counts.direct).padStart(6)} (${pct(counts.direct, total)})`,
    `  relation_fallback: ${String(counts.relation_fallback).padStart(6)} (${pct(counts.relation_fallback, total)})`,
    `  display_fallback:  ${String(counts.display_fallback).padStart(6)} (${pct(counts.display_fallback, total)})`,
    `  unresolved:        ${String(counts.unresolved).padStart(6)} (${pct(counts.unresolved, total)})`,
  ];
}

export function printAuditResult(
  result: AuditResult,
  activeOnly: boolean
): void {
  const { spec, totalItems, counts, samples, filteredOut } = result;

  console.log(`\n[${spec.key}] ${spec.label}`);
  console.log(`  board: ${spec.boardAlias} (${spec.boardId})`);
  console.log(`  direct target: ${spec.directColumnId} (${spec.directLabel})`);
  if (spec.fallback?.kind === "relation") {
    console.log(
      `  relation fallback: ${spec.fallback.columnId} (${spec.fallback.label})${
        spec.fallback.requiresDisplay ? " + display fallback present" : ""
      }`
    );
  }
  if (spec.fallback?.kind === "contact_to_contractors") {
    console.log(
      `  relation fallback: ${spec.fallback.contactRelationColumnId} (${spec.fallback.label})`
    );
  }
  if (spec.displayFallbackColumnIds.length > 0) {
    console.log(
      `  display fallback: ${spec.displayFallbackColumnIds.join(", ")} (${spec.displayFallbackLabel})`
    );
  }

  if (activeOnly && filteredOut > 0) {
    console.log(`  filtered out by --active-only: ${filteredOut}`);
  }

  console.log(`  total evaluated: ${totalItems}`);
  for (const line of formatBucketCounts(counts, totalItems)) {
    console.log(line);
  }

  for (const bucket of ["relation_fallback", "display_fallback", "unresolved"] as const) {
    if (samples[bucket].length > 0) {
      console.log(`  ${bucket} samples:`);
      for (const sample of samples[bucket]) {
        console.log(`    - ${sample}`);
      }
    }
  }
}
