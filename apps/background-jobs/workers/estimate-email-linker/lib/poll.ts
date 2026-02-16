/**
 * Estimate Email Linker
 *
 * Goal: continuously populate `estimate_emails` (canonical join table) using
 * deterministic signals.
 *
 * Design principles:
 * - Conservative: only auto-link when the match is unambiguous.
 * - Idempotent: inserts use ON CONFLICT DO NOTHING.
 * - Incremental: stores a "last processed email id" in estimate_poller_config.
 *
 * Signals (ordered by reliability):
 * 1) Monday pulse ID present in subject/body_preview/attachment_names → estimates.monday_item_id
 * 2) Estimate number present (e.g. Est_03192502) → estimates.estimate_number (digits-only)
 *    - If estimate_number is not unique, only link when disambiguated by:
 *      a) existing project_estimates for email.project_id
 *      b) estimate.account_domain matches email.from_domain
 * 3) Project link (emails.project_id) where project has exactly 1 estimate in project_estimates
 */

import { db } from "@lib/db/hub";
import {
  buildEstimateIndex,
  disambiguateEstimatesForEmail,
  type EmailRow,
  type EstimateIndexRow,
  extractEstimateNumbers,
  extractMondayPulseIds,
  fetchProjectEstimates,
  safeJsonArray,
  uniq,
} from "./poll-data";

// Reuse estimate-poller config table for lightweight worker state.
const CONFIG_KEY_LAST_EMAIL_ID = "estimate_email_linker_last_email_id";

async function getConfig(key: string): Promise<string | null> {
  const row = await db
    .query<{ value: string }, [string]>(
      "SELECT value FROM estimate_poller_config WHERE key = ?"
    )
    .get(key);
  return row?.value ?? null;
}

async function setConfig(key: string, value: string): Promise<void> {
  await db.run(
    "INSERT INTO estimate_poller_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value]
  );
}

const insertLink = db.prepare(`
  INSERT INTO estimate_emails (estimate_id, email_id, match_type, match_detail)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT DO NOTHING
`);

export interface PollOptions {
  dryRun?: boolean;
  batchSize?: number;
  maxBatches?: number;
  minEmailId?: number;
  enableProjectSingle?: boolean;
}

export interface PollStats {
  processedEmails: number;
  linksInserted: number;
  skippedAmbiguous: number;
  skippedNoSignal: number;
  lastEmailId: number;
}

// ── Link insertion helper ──────────────────────────────────────────────

async function tryInsertLink(
  dryRun: boolean,
  estimateId: number,
  emailId: number,
  matchType: string,
  detail: string
): Promise<number> {
  if (dryRun) {
    return 1;
  }
  const r = await insertLink.run(estimateId, emailId, matchType, detail);
  return r.count ?? 0;
}

// ── Per-email matching strategies ──────────────────────────────────────

interface MatchContext {
  email: EmailRow;
  haystack: string;
  projectEstimateIds: number[];
  byMondayItemId: Map<string, EstimateIndexRow>;
  byEstimateNumber: Map<string, EstimateIndexRow[]>;
  dryRun: boolean;
  enableProjectSingle: boolean;
}

type MatchResult =
  | { outcome: "linked"; inserted: number }
  | { outcome: "ambiguous" }
  | { outcome: "no_signal" };

async function tryMatchByPulseId(
  ctx: MatchContext
): Promise<MatchResult | null> {
  const mondayIds = extractMondayPulseIds(ctx.haystack);
  if (mondayIds.length === 0) {
    return null;
  }

  let inserted = 0;
  for (const mid of mondayIds) {
    const est = ctx.byMondayItemId.get(mid);
    if (!est) {
      continue;
    }
    inserted += await tryInsertLink(
      ctx.dryRun,
      est.id,
      ctx.email.id,
      "monday_pulse_id",
      `matched monday_item_id=${mid}`
    );
  }
  return { outcome: "linked", inserted };
}

async function tryMatchByEstimateNumber(
  ctx: MatchContext
): Promise<MatchResult | null> {
  const nums = extractEstimateNumbers(ctx.haystack);
  if (nums.length === 0) {
    return null;
  }

  let totalInserted = 0;
  let ambiguousCount = 0;

  for (const n of nums) {
    const candidates = ctx.byEstimateNumber.get(n) ?? [];
    if (candidates.length === 0) {
      continue;
    }

    const narrowed = disambiguateEstimatesForEmail({
      candidates,
      emailFromDomain: ctx.email.from_domain,
      emailProjectEstimateIds: ctx.projectEstimateIds.length
        ? ctx.projectEstimateIds
        : null,
    });

    if (narrowed.length !== 1 || !narrowed[0]) {
      ambiguousCount++;
      continue;
    }

    totalInserted += await tryInsertLink(
      ctx.dryRun,
      narrowed[0].id,
      ctx.email.id,
      "estimate_number",
      `matched estimate_number=${n} (source=subject/body/attachments)`
    );
  }

  if (totalInserted > 0) {
    return { outcome: "linked", inserted: totalInserted };
  }
  if (ambiguousCount > 0) {
    return { outcome: "ambiguous" };
  }
  return null;
}

async function tryMatchByProjectSingle(
  ctx: MatchContext
): Promise<MatchResult | null> {
  if (!ctx.enableProjectSingle || ctx.projectEstimateIds.length !== 1) {
    return null;
  }

  const estId = ctx.projectEstimateIds[0];
  if (estId == null) {
    return null;
  }

  const inserted = await tryInsertLink(
    ctx.dryRun,
    estId,
    ctx.email.id,
    "project_estimates_single",
    `linked via project_id=${ctx.email.project_id}`
  );
  return { outcome: "linked", inserted };
}

// ── Cursor initialization ──────────────────────────────────────────────

async function resolveStartFrom(
  dryRun: boolean,
  minEmailId: number | undefined | null
): Promise<number> {
  if (minEmailId != null) {
    return minEmailId;
  }

  const cfg = await getConfig(CONFIG_KEY_LAST_EMAIL_ID);
  if (cfg) {
    const parsed = Number.parseInt(cfg, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // First run: start near the newest emails for quick validation.
  const row = await db
    .query<{ max_id: number }>(
      "SELECT COALESCE(MAX(id), 0)::int AS max_id FROM emails"
    )
    .get();
  const startFrom = Math.max(0, (row?.max_id ?? 0) - 10_000);

  if (!dryRun) {
    await setConfig(CONFIG_KEY_LAST_EMAIL_ID, String(startFrom));
  }
  return startFrom;
}

// ── Per-email orchestration ───────────────────────────────────────────

function buildMatchContext(
  email: EmailRow,
  projMap: Map<number, number[]>,
  byMondayItemId: Map<string, EstimateIndexRow>,
  byEstimateNumber: Map<string, EstimateIndexRow[]>,
  dryRun: boolean,
  enableProjectSingle: boolean
): MatchContext {
  const attachmentNames = safeJsonArray(email.attachment_names);
  const haystack = [
    email.subject ?? "",
    email.normalized_subject ?? "",
    email.body_preview ?? "",
    ...attachmentNames,
  ]
    .filter(Boolean)
    .join("\n");

  const projectEstimateIds =
    email.project_id != null ? (projMap.get(email.project_id) ?? []) : [];

  return {
    email,
    haystack,
    projectEstimateIds,
    byMondayItemId,
    byEstimateNumber,
    dryRun,
    enableProjectSingle,
  };
}

type EmailMatchOutcome = "linked" | "ambiguous" | "no_signal";

interface EmailMatchResult {
  outcome: EmailMatchOutcome;
  linksInserted: number;
}

const MATCH_STRATEGIES = [
  tryMatchByPulseId,
  tryMatchByEstimateNumber,
  tryMatchByProjectSingle,
];

async function processSingleEmail(
  ctx: MatchContext
): Promise<EmailMatchResult> {
  for (const strategy of MATCH_STRATEGIES) {
    const result = await strategy(ctx);
    if (!result) {
      continue;
    }
    if (result.outcome === "linked") {
      return { outcome: "linked", linksInserted: result.inserted };
    }
    if (result.outcome === "ambiguous") {
      return { outcome: "ambiguous", linksInserted: 0 };
    }
  }
  return { outcome: "no_signal", linksInserted: 0 };
}

// ── Main poll loop ─────────────────────────────────────────────────────

export async function pollEstimateEmailLinker(
  opts: PollOptions = {}
): Promise<PollStats> {
  const dryRun = Boolean(opts.dryRun);
  const batchSize = Math.max(50, Math.min(5000, opts.batchSize ?? 500));
  const maxBatchesRaw = opts.maxBatches ?? 10;
  const maxBatches =
    maxBatchesRaw <= 0 ? Number.POSITIVE_INFINITY : Math.max(1, maxBatchesRaw);
  const enableProjectSingle = Boolean(opts.enableProjectSingle);

  const { byMondayItemId, byEstimateNumber } = await buildEstimateIndex();
  const startFrom = await resolveStartFrom(dryRun, opts.minEmailId);

  let lastId = startFrom;
  let processedEmails = 0;
  let linksInserted = 0;
  let skippedAmbiguous = 0;
  let skippedNoSignal = 0;

  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await db
      .query<EmailRow, [number, number]>(
        `
        SELECT
          id, subject, normalized_subject, attachment_names, body_preview,
          from_domain, project_id, received_at
        FROM emails e
        WHERE e.id > ?
          AND e.is_excluded = 0
          AND NOT EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
          AND (
            e.classification = 'ESTIMATE'
            OR e.has_attachments = 1
            OR e.subject ILIKE '%Est_%'
            OR e.attachment_names ILIKE '%Est_%'
            OR e.body_preview ILIKE '%Est_%'
            OR e.subject ILIKE '%estimate%'
            OR e.body_preview ILIKE '%estimate%'
          )
        ORDER BY e.id ASC
        LIMIT ?
      `
      )
      .all(lastId, batchSize);

    if (rows.length === 0) {
      break;
    }

    const projectIds = uniq(
      rows.map((r) => r.project_id).filter((v): v is number => v != null)
    );
    const projMap = await fetchProjectEstimates(projectIds);

    for (const email of rows) {
      processedEmails++;
      lastId = Math.max(lastId, email.id);

      const ctx = buildMatchContext(
        email,
        projMap,
        byMondayItemId,
        byEstimateNumber,
        dryRun,
        enableProjectSingle
      );
      const result = await processSingleEmail(ctx);
      linksInserted += result.linksInserted;
      if (result.outcome === "ambiguous") {
        skippedAmbiguous++;
      } else if (result.outcome === "no_signal") {
        skippedNoSignal++;
      }
    }

    if (!dryRun) {
      await setConfig(CONFIG_KEY_LAST_EMAIL_ID, String(lastId));
    }
  }

  return {
    processedEmails,
    linksInserted,
    skippedAmbiguous,
    skippedNoSignal,
    lastEmailId: lastId,
  };
}
