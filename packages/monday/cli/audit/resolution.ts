import { AUDIT_CHAINS, type AuditChainSpec, type AuditResult } from "./chains";
import {
  fetchBoardItemsWithColumns,
  fetchContactsWithContractorLink,
  filterActiveItems,
  getColumnsToFetch,
} from "./fetch";
import { printAuditResult } from "./render";
import {
  createCounts,
  createSamples,
  filterDirectRows,
  filterRowsByNoRelation,
} from "./resolution-helpers";

function createAuditResult(
  spec: AuditChainSpec,
  rowsLength: number,
  filteredOut: number
): AuditResult {
  return {
    counts: createCounts(),
    filteredOut,
    samples: createSamples(),
    spec,
    totalItems: rowsLength,
  };
}

async function runChainAudit(
  spec: AuditChainSpec,
  activeOnly: boolean
): Promise<AuditResult> {
  const allRows = await fetchBoardItemsWithColumns(
    spec.boardId,
    getColumnsToFetch(spec)
  );
  const rows = filterActiveItems(
    allRows,
    spec.skipGroupsWhenActiveOnly,
    activeOnly
  );

  let contactIdsWithContractor = new Set<string>();
  if (spec.fallback?.kind === "contact_to_contractors") {
    const contactIds = filterRowsByNoRelation(rows, spec);
    contactIdsWithContractor = await fetchContactsWithContractorLink(
      contactIds,
      spec.fallback.contactToContractorColumnId
    );
  }

  const result = createAuditResult(
    spec,
    rows.length,
    allRows.length - rows.length
  );
  filterDirectRows(rows, spec, result, contactIdsWithContractor);
  return result;
}

export async function runResolutionAudit(
  scope: string,
  activeOnly: boolean
): Promise<void> {
  const chainSpecs =
    scope === "all"
      ? AUDIT_CHAINS
      : AUDIT_CHAINS.filter((chain) => chain.key === scope);

  if (chainSpecs.length === 0) {
    throw new Error(
      `Unknown audit chain: ${scope}. Use one of: all, ${AUDIT_CHAINS.map((c) => c.key).join(", ")}`
    );
  }

  console.log("Resolution audit buckets:");
  console.log(
    "  direct: direct relation column on the target board is populated"
  );
  console.log(
    "  relation_fallback: direct is blank, but relation-chain fallback resolves"
  );
  console.log(
    "  display_fallback: direct/fallback relation is blank, display mirror still has value"
  );
  console.log(
    "  unresolved: no direct relation, no relation fallback, no display fallback"
  );

  for (const spec of chainSpecs) {
    const result = await runChainAudit(spec, activeOnly);
    printAuditResult(result, activeOnly);
  }
}
