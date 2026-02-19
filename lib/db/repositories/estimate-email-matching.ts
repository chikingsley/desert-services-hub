import { db } from "@lib/db/client";
import {
  buildEstimateDecision,
  buildEstimateHintText,
  rankEstimateCandidates,
} from "@lib/db/repositories/estimate-email-matching-ranking";
import type {
  DocumentExtractionRow,
  EstimateCandidateResult,
  EstimateCandidateRow,
  EstimateMatchContext,
  EstimateMatchEmailRow,
  EstimateMatchHintInput,
} from "@lib/db/repositories/types";
import {
  COMMON_FREE_EMAIL_DOMAINS,
  extractEstimateNumbers,
  extractMondayItemIds,
  extractSearchTermsFromText,
  getNestedString,
  normalizeEstimateNumberDigits,
  parseJsonStringArray,
  parseRawExtraction,
  uniquePositiveInts,
  uniqueStrings,
} from "@lib/db/repositories/types";

interface DocumentHintCollection {
  contractorHints: string[];
  projectHints: string[];
  addressHints: string[];
  estimateReferenceHints: string[];
  queryHints: string[];
}

function emptyDocumentHints(): DocumentHintCollection {
  return {
    contractorHints: [],
    projectHints: [],
    addressHints: [],
    estimateReferenceHints: [],
    queryHints: [],
  };
}

function pushIfPresent(
  values: string[],
  value: string | null | undefined
): void {
  const trimmed = (value ?? "").trim();
  if (trimmed.length > 0) {
    values.push(trimmed);
  }
}

function collectHintsFromExtraction(
  hints: DocumentHintCollection,
  extraction: Record<string, unknown> | null
): void {
  pushIfPresent(
    hints.estimateReferenceHints,
    getNestedString(extraction, "estimate_reference")
  );
  pushIfPresent(
    hints.projectHints,
    getNestedString(extraction, "project", "name")
  );
  pushIfPresent(
    hints.projectHints,
    getNestedString(extraction, "project", "number")
  );
  pushIfPresent(
    hints.addressHints,
    getNestedString(extraction, "project", "address")
  );
  pushIfPresent(
    hints.contractorHints,
    getNestedString(extraction, "parties", "contractor")
  );
}

function collectDocumentHints(
  rows: DocumentExtractionRow[]
): DocumentHintCollection {
  const hints = emptyDocumentHints();
  for (const row of rows) {
    const extraction = parseRawExtraction(row.raw_extraction);
    collectHintsFromExtraction(hints, extraction);
    pushIfPresent(hints.queryHints, row.summary);
    pushIfPresent(hints.queryHints, row.file_name);
  }
  return hints;
}

async function fetchEstimateRowsByRef(
  refs: string[]
): Promise<EstimateCandidateRow[]> {
  if (refs.length === 0) {
    return [];
  }
  const placeholders = refs.map((_, i) => `$${i + 1}`).join(", ");
  return await db
    .query<EstimateCandidateRow>(
      `SELECT
         id, name, job_name, contractor, estimate_number,
         monday_item_id::text as monday_item_id, account_domain,
         job_address, location, bid_status, updated_at
       FROM estimates
       WHERE regexp_replace(coalesce(estimate_number, ''), '[^0-9]', '', 'g')
             IN (${placeholders})
       ORDER BY updated_at DESC
       LIMIT 80`
    )
    .all(...refs);
}

async function fetchEstimateRowsByIds(
  ids: number[]
): Promise<EstimateCandidateRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  return await db
    .query<EstimateCandidateRow>(
      `SELECT
         id, name, job_name, contractor, estimate_number,
         monday_item_id::text as monday_item_id, account_domain,
         job_address, location, bid_status, updated_at
       FROM estimates
       WHERE id IN (${placeholders})
       ORDER BY updated_at DESC`
    )
    .all(...ids);
}

async function fetchEstimateRowsByMondayItemId(
  mondayItemIds: string[]
): Promise<EstimateCandidateRow[]> {
  if (mondayItemIds.length === 0) {
    return [];
  }
  const placeholders = mondayItemIds.map((_, i) => `$${i + 1}`).join(", ");
  return await db
    .query<EstimateCandidateRow>(
      `SELECT
         id, name, job_name, contractor, estimate_number,
         monday_item_id::text as monday_item_id, account_domain,
         job_address, location, bid_status, updated_at
       FROM estimates
       WHERE monday_item_id::text IN (${placeholders})
       ORDER BY updated_at DESC
       LIMIT 80`
    )
    .all(...mondayItemIds);
}

async function fetchEstimateRowsByDomain(
  fromDomain: string
): Promise<EstimateCandidateRow[]> {
  if (COMMON_FREE_EMAIL_DOMAINS.has(fromDomain)) {
    return [];
  }
  return await db
    .query<EstimateCandidateRow, [string]>(
      `SELECT
         id, name, job_name, contractor, estimate_number,
         monday_item_id::text as monday_item_id, account_domain,
         job_address, location, bid_status, updated_at
       FROM estimates
       WHERE lower(coalesce(account_domain, '')) = lower($1)
       ORDER BY updated_at DESC
       LIMIT 120`
    )
    .all(fromDomain);
}

async function fetchEstimateRowsByFuzzySearch(
  query: string,
  limit = 30
): Promise<EstimateCandidateRow[]> {
  if (query.trim().length < 2) {
    return [];
  }
  const pattern = `%${query.toLowerCase()}%`;
  return await db
    .query<EstimateCandidateRow, [string, number]>(
      `SELECT
         id, name, job_name, contractor, estimate_number,
         monday_item_id::text as monday_item_id, account_domain,
         job_address, location, bid_status, updated_at
       FROM estimates
       WHERE lower(
         coalesce(name, '') || ' ' ||
         coalesce(job_name, '') || ' ' ||
         coalesce(contractor, '') || ' ' ||
         coalesce(job_address, '') || ' ' ||
         coalesce(location, '') || ' ' ||
         coalesce(estimate_number, '')
       ) ILIKE $1
       ORDER BY updated_at DESC
       LIMIT $2`
    )
    .all(pattern, limit);
}

async function resolveEmailMatchContext(
  emailId: number,
  hints: EstimateMatchHintInput = {}
): Promise<EstimateMatchContext | null> {
  const email = await db
    .query<EstimateMatchEmailRow, [number]>(
      `SELECT
         id, subject, body_preview, attachment_names, from_domain,
         contractor_name, project_name, monday_estimate_id
       FROM emails
       WHERE id = $1`
    )
    .get(emailId);
  if (!email) {
    return null;
  }

  const docRows = await db
    .query<DocumentExtractionRow, [number]>(
      `SELECT raw_extraction, summary, file_name
       FROM documents
       WHERE email_id = $1
       ORDER BY created_at DESC
       LIMIT 12`
    )
    .all(emailId);
  const docHints = collectDocumentHints(docRows);

  return {
    emailId,
    subject: email.subject ?? "",
    bodyPreview: email.body_preview ?? "",
    attachmentNames: parseJsonStringArray(email.attachment_names),
    fromDomain: email.from_domain,
    contractorHints: uniqueStrings([
      email.contractor_name,
      ...docHints.contractorHints,
      ...(hints.contractorHints ?? []),
    ]),
    projectHints: uniqueStrings([
      email.project_name,
      ...docHints.projectHints,
      ...(hints.projectHints ?? []),
    ]),
    addressHints: uniqueStrings([
      ...docHints.addressHints,
      ...(hints.addressHints ?? []),
    ]),
    estimateReferenceHints: uniqueStrings([
      ...docHints.estimateReferenceHints,
      ...(hints.estimateReferenceHints ?? []),
    ]),
    mondayItemHints: uniqueStrings([
      email.monday_estimate_id,
      ...(hints.mondayItemHints ?? []),
    ]),
    queryHints: uniqueStrings([
      ...docHints.queryHints,
      ...(hints.queryHints ?? []),
    ]),
  };
}

function addRows(
  rowsById: Map<number, EstimateCandidateRow>,
  rows: EstimateCandidateRow[]
): void {
  for (const row of rows) {
    rowsById.set(row.id, row);
  }
}

function buildFuzzySearchInputs(context: EstimateMatchContext): string[] {
  return uniqueStrings([
    context.subject,
    ...context.projectHints,
    ...context.contractorHints,
    ...context.addressHints,
    ...context.queryHints,
    ...extractSearchTermsFromText(context.subject, 5),
    ...extractSearchTermsFromText(context.bodyPreview, 5),
    ...context.attachmentNames.flatMap((name) =>
      extractSearchTermsFromText(name, 3)
    ),
  ]).slice(0, 12);
}

async function fetchSeedRows(
  context: EstimateMatchContext,
  hints: EstimateMatchHintInput
): Promise<EstimateCandidateRow[]> {
  const rowsById = new Map<number, EstimateCandidateRow>();
  const restrictedEstimateIds = uniquePositiveInts(
    hints.restrictEstimateIds ?? []
  ).slice(0, 1000);

  if (restrictedEstimateIds.length > 0) {
    addRows(rowsById, await fetchEstimateRowsByIds(restrictedEstimateIds));
    return [...rowsById.values()];
  }

  const hintText = buildEstimateHintText(context);
  const exactEstimateRefs = uniqueStrings([
    ...context.estimateReferenceHints,
    ...extractEstimateNumbers(hintText),
  ])
    .map((value) => normalizeEstimateNumberDigits(value))
    .filter((value): value is string => Boolean(value));
  const mondayItemHints = uniqueStrings([
    ...context.mondayItemHints,
    ...extractMondayItemIds(hintText),
  ]);

  addRows(rowsById, await fetchEstimateRowsByRef(exactEstimateRefs));
  addRows(rowsById, await fetchEstimateRowsByMondayItemId(mondayItemHints));

  if (context.fromDomain) {
    addRows(rowsById, await fetchEstimateRowsByDomain(context.fromDomain));
  }

  for (const search of buildFuzzySearchInputs(context)) {
    addRows(rowsById, await fetchEstimateRowsByFuzzySearch(search, 25));
  }

  return [...rowsById.values()];
}

export async function findEstimateCandidatesForEmail(
  emailId: number,
  hints: EstimateMatchHintInput = {}
): Promise<EstimateCandidateResult | null> {
  const context = await resolveEmailMatchContext(emailId, hints);
  if (!context) {
    return null;
  }

  const rows = await fetchSeedRows(context, hints);
  const limit = Math.max(1, Math.min(25, hints.limit ?? 10));
  const candidates = rankEstimateCandidates(rows, context).slice(0, limit);
  const decision = buildEstimateDecision(candidates);

  return {
    context,
    candidates,
    decision,
  };
}
