import { categorizeRow, tallyResult } from "./analysis";
import type {
  AuditChainSpec,
  AuditItem,
  AuditResult,
  BucketKey,
} from "./chains";

export function createCounts(): Record<BucketKey, number> {
  return {
    direct: 0,
    display_fallback: 0,
    relation_fallback: 0,
    unresolved: 0,
  };
}

export function createSamples(): Record<BucketKey, string[]> {
  return {
    direct: [],
    display_fallback: [],
    relation_fallback: [],
    unresolved: [],
  };
}

export function filterDirectRows(
  rows: AuditItem[],
  spec: AuditChainSpec,
  result: AuditResult,
  contactIdsWithContractor: Set<string>
): void {
  for (const row of rows) {
    const bucket = categorizeRow(row, spec, contactIdsWithContractor);
    tallyResult(result, bucket, row);
  }
}

export function filterRowsByNoRelation(
  rows: AuditItem[],
  spec: AuditChainSpec
): string[] {
  const contactIds = new Set<string>();
  for (const row of rows) {
    const direct = row.columnValues.find((c) => c.id === spec.directColumnId);
    const directCount = direct?.linked_item_ids?.length ?? 0;
    if (directCount > 0) {
      continue;
    }

    if (!spec.fallback) {
      continue;
    }

    const fallbackColumnId =
      spec.fallback.kind === "contact_to_contractors"
        ? spec.fallback.contactRelationColumnId
        : spec.fallback.columnId;

    const fallbackContacts = row.columnValues.find(
      (c) => c.id === fallbackColumnId
    );

    for (const contactId of fallbackContacts?.linked_item_ids ?? []) {
      contactIds.add(contactId);
    }
  }
  return [...contactIds];
}
