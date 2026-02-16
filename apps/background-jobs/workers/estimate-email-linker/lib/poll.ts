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

// Reuse estimate-poller config table for lightweight worker state.
const CONFIG_KEY_LAST_EMAIL_ID = "estimate_email_linker_last_email_id";

interface EmailRow {
  id: number;
  subject: string | null;
  normalized_subject: string | null;
  attachment_names: string | null; // JSON array string
  body_preview: string | null;
  from_domain: string | null;
  project_id: number | null;
  received_at: string;
}

interface EstimateIndexRow {
  id: number;
  monday_item_id: string | null;
  estimate_number: string | null;
  account_domain: string | null;
  name: string;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function safeJsonArray(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

function extractMondayPulseIds(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/(?:pulses|items)\/(\d{6,})/gi)) {
    const id = match[1];
    if (id) {
      ids.push(id);
    }
  }
  return uniq(ids);
}

function normalizeEstimateNumberDigits(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 6 || digits.length > 8) {
    return null;
  }
  return digits;
}

function extractEstimateNumbers(text: string): string[] {
  const out: string[] = [];

  // Est_03192502, Est-03192502, Est 03192502, etc (+ optional -R# suffix).
  for (const match of text.matchAll(
    /\bEst(?:imate)?[_\s-]*([0-9]{6,8})(?:\s*-?\s*R[0-9]+)?\b/gi
  )) {
    const n = normalizeEstimateNumberDigits(match[1] ?? "");
    if (n) {
      out.push(n);
    }
  }

  // "Estimate: 03192502"
  for (const match of text.matchAll(/\bEstimate[:\s#]*([0-9]{6,8})\b/gi)) {
    const n = normalizeEstimateNumberDigits(match[1] ?? "");
    if (n) {
      out.push(n);
    }
  }

  return uniq(out);
}

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

async function buildEstimateIndex(): Promise<{
  byMondayItemId: Map<string, EstimateIndexRow>;
  byEstimateNumber: Map<string, EstimateIndexRow[]>;
}> {
  const rows = await db
    .query<EstimateIndexRow>(
      `SELECT id, monday_item_id, estimate_number, account_domain, name
       FROM estimates`
    )
    .all();

  const byMondayItemId = new Map<string, EstimateIndexRow>();
  const byEstimateNumber = new Map<string, EstimateIndexRow[]>();

  for (const r of rows) {
    if (r.monday_item_id) {
      byMondayItemId.set(String(r.monday_item_id), r);
    }

    if (r.estimate_number) {
      const n = normalizeEstimateNumberDigits(String(r.estimate_number));
      if (n) {
        const arr = byEstimateNumber.get(n) ?? [];
        arr.push(r);
        byEstimateNumber.set(n, arr);
      }
    }
  }

  return { byMondayItemId, byEstimateNumber };
}

async function fetchProjectEstimates(
  projectIds: number[]
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (projectIds.length === 0) {
    return out;
  }

  const placeholders = projectIds.map(() => "?").join(", ");
  const rows = await db
    .query<{ project_id: number; estimate_id: number }, number[]>(
      `SELECT project_id, estimate_id
       FROM project_estimates
       WHERE project_id IN (${placeholders})`
    )
    .all(...projectIds);

  for (const r of rows) {
    const arr = out.get(r.project_id) ?? [];
    arr.push(r.estimate_id);
    out.set(r.project_id, arr);
  }

  for (const [k, v] of out.entries()) {
    out.set(k, uniq(v));
  }

  return out;
}

function disambiguateEstimatesForEmail(opts: {
  candidates: EstimateIndexRow[];
  emailFromDomain: string | null;
  emailProjectEstimateIds: number[] | null;
}): EstimateIndexRow[] {
  const { candidates, emailFromDomain, emailProjectEstimateIds } = opts;
  if (candidates.length <= 1) {
    return candidates;
  }

  // 1) If the email's project already maps to estimates, intersect.
  if (emailProjectEstimateIds && emailProjectEstimateIds.length > 0) {
    const set = new Set(emailProjectEstimateIds);
    const narrowed = candidates.filter((c) => set.has(c.id));
    if (narrowed.length > 0) {
      return narrowed;
    }
  }

  // 2) Match by account domain (GC domain from Monday) when available.
  if (emailFromDomain) {
    const d = emailFromDomain.toLowerCase();
    const narrowed = candidates.filter(
      (c) => (c.account_domain ?? "").toLowerCase() === d
    );
    if (narrowed.length > 0) {
      return narrowed;
    }
  }

  return candidates;
}

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

      const ctx: MatchContext = {
        email,
        haystack,
        projectEstimateIds,
        byMondayItemId,
        byEstimateNumber,
        dryRun,
        enableProjectSingle,
      };

      // Cascade: try each strategy in order of reliability
      const strategies = [
        tryMatchByPulseId,
        tryMatchByEstimateNumber,
        tryMatchByProjectSingle,
      ];

      let matched = false;
      for (const strategy of strategies) {
        const result = await strategy(ctx);
        if (!result) {
          continue;
        }

        if (result.outcome === "linked") {
          linksInserted += result.inserted;
          matched = true;
          break;
        }
        if (result.outcome === "ambiguous") {
          skippedAmbiguous++;
          matched = true;
          break;
        }
      }

      if (!matched) {
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
