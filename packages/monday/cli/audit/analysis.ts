import type {
  AuditChainSpec,
  AuditItem,
  AuditResult,
  BucketKey,
} from "./chains";

export function getColumnValue(
  item: AuditItem,
  columnId: string
): {
  id: string;
  linked_item_ids?: string[];
  display_value?: string | null;
  text?: string | null;
} | null {
  return item.columnValues.find((c) => c.id === columnId) ?? null;
}

export function hasLinkedRelation(item: AuditItem, columnId: string): boolean {
  const col = getColumnValue(item, columnId);
  return (col?.linked_item_ids?.length ?? 0) > 0;
}

export function getDisplayValue(
  item: AuditItem,
  columnId: string
): string | null {
  const col = getColumnValue(item, columnId);
  const display = (col?.display_value ?? col?.text ?? "").trim();
  if (!display || display.toLowerCase() === "null") {
    return null;
  }
  return display;
}

export function hasDisplayFallback(
  item: AuditItem,
  spec: AuditChainSpec
): boolean {
  return spec.displayFallbackColumnIds.some(
    (colId) => getDisplayValue(item, colId) !== null
  );
}

export function categorizeRow(
  item: AuditItem,
  spec: AuditChainSpec,
  contactIdsWithContractor: Set<string>
): BucketKey {
  const direct = hasLinkedRelation(item, spec.directColumnId);
  if (direct) {
    return "direct";
  }

  const relationFallback = resolveRelationFallback(
    item,
    spec,
    contactIdsWithContractor
  );
  if (relationFallback) {
    return "relation_fallback";
  }

  if (hasDisplayFallback(item, spec)) {
    return "display_fallback";
  }
  return "unresolved";
}

export function tallyResult(
  result: AuditResult,
  bucket: BucketKey,
  item: AuditItem
): void {
  result.counts[bucket] += 1;
  if (result.samples[bucket].length < 5) {
    result.samples[bucket].push(`${item.id}: ${item.name}`);
  }
}

function resolveRelationFallback(
  row: AuditItem,
  spec: AuditChainSpec,
  contactIdsWithContractor: Set<string>
): boolean {
  if (!spec.fallback) {
    return false;
  }
  if (spec.fallback.kind === "relation") {
    const relationPresent = hasLinkedRelation(row, spec.fallback.columnId);
    return spec.fallback.requiresDisplay
      ? relationPresent && hasDisplayFallback(row, spec)
      : relationPresent;
  }

  const relCol = getColumnValue(row, spec.fallback.contactRelationColumnId);
  return (relCol?.linked_item_ids ?? []).some((contactId) =>
    contactIdsWithContractor.has(contactId)
  );
}
