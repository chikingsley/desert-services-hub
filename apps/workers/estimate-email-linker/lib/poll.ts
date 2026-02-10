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

type EmailRow = {
  id: number;
  subject: string | null;
  normalized_subject: string | null;
  attachment_names: string | null; // JSON array string
  body_preview: string | null;
  from_domain: string | null;
  project_id: number | null;
  received_at: string;
};

type EstimateIndexRow = {
  id: number;
  monday_item_id: string | null;
  estimate_number: string | null;
  account_domain: string | null;
  name: string;
};

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function safeJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

function extractMondayPulseIds(text: string): string[] {
  const ids: string[] = [];
  const re = /(?:pulses|items)\/(\d{6,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) ids.push(m[1]);
  }
  return uniq(ids);
}

function normalizeEstimateNumberDigits(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 6 || digits.length > 8) return null;
  return digits;
}

function extractEstimateNumbers(text: string): string[] {
  const out: string[] = [];

  // Est_03192502, Est-03192502, Est 03192502, etc (+ optional -R# suffix).
  const estRe = /\bEst(?:imate)?[_\s-]*([0-9]{6,8})(?:\s*-?\s*R[0-9]+)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = estRe.exec(text))) {
    const n = normalizeEstimateNumberDigits(m[1] ?? "");
    if (n) out.push(n);
  }

  // "Estimate: 03192502"
  const estimateWordRe = /\bEstimate[:\s#]*([0-9]{6,8})\b/gi;
  while ((m = estimateWordRe.exec(text))) {
    const n = normalizeEstimateNumberDigits(m[1] ?? "");
    if (n) out.push(n);
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
  if (projectIds.length === 0) return out;

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
  if (candidates.length <= 1) return candidates;

  // 1) If the email's project already maps to estimates, intersect.
  if (emailProjectEstimateIds && emailProjectEstimateIds.length > 0) {
    const set = new Set(emailProjectEstimateIds);
    const narrowed = candidates.filter((c) => set.has(c.id));
    if (narrowed.length > 0) return narrowed;
  }

  // 2) Match by account domain (GC domain from Monday) when available.
  if (emailFromDomain) {
    const d = emailFromDomain.toLowerCase();
    const narrowed = candidates.filter(
      (c) => (c.account_domain ?? "").toLowerCase() === d
    );
    if (narrowed.length > 0) return narrowed;
  }

  return candidates;
}

export interface PollOptions {
  dryRun?: boolean;
  batchSize?: number;
  maxBatches?: number;
  minEmailId?: number;
}

export interface PollStats {
  processedEmails: number;
  linksInserted: number;
  skippedAmbiguous: number;
  skippedNoSignal: number;
  lastEmailId: number;
}

export async function pollEstimateEmailLinker(
  opts: PollOptions = {}
): Promise<PollStats> {
  const dryRun = Boolean(opts.dryRun);
  const batchSize = Math.max(50, Math.min(5000, opts.batchSize ?? 500));
  const maxBatches = Math.max(1, opts.maxBatches ?? 10);

  const { byMondayItemId, byEstimateNumber } = await buildEstimateIndex();

  let startFrom: number;
  if (opts.minEmailId != null) {
    startFrom = opts.minEmailId;
  } else {
    const cfg = await getConfig(CONFIG_KEY_LAST_EMAIL_ID);
    if (cfg) {
      startFrom = Number.parseInt(cfg, 10);
      if (!Number.isFinite(startFrom)) startFrom = 0;
    } else {
      // First run: start near the newest emails so we can validate behavior quickly.
      // If you want a full backfill, pass --min-id=0 from the CLI.
      const row = await db
        .query<{ max_id: number }>(
          "SELECT COALESCE(MAX(id), 0)::int AS max_id FROM emails"
        )
        .get();
      startFrom = Math.max(0, (row?.max_id ?? 0) - 10_000);

      // Persist the default starting point so subsequent runs are incremental.
      if (!dryRun) {
        await setConfig(CONFIG_KEY_LAST_EMAIL_ID, String(startFrom));
      }
    }
  }

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
        email.project_id != null ? projMap.get(email.project_id) ?? [] : [];

      // -------------------------------------------------------------------
      // Strategy 1: Monday pulse ID match (unique)
      // -------------------------------------------------------------------
      const mondayIds = extractMondayPulseIds(haystack);
      for (const mid of mondayIds) {
        const est = byMondayItemId.get(mid);
        if (!est) continue;
        if (!dryRun) {
          const r = await insertLink.run(
            est.id,
            email.id,
            "monday_pulse_id",
            `matched monday_item_id=${mid}`
          );
          linksInserted += r.count ?? 0;
        } else {
          linksInserted++;
        }
        // If we have a hard ID match, we don't need to do anything else.
        continue;
      }
      if (mondayIds.length > 0) {
        // Even if we didn't find a matching estimate, don't do weaker heuristics.
        continue;
      }

      // -------------------------------------------------------------------
      // Strategy 2: Estimate number match (digits-only) with disambiguation.
      // -------------------------------------------------------------------
      const nums = extractEstimateNumbers(haystack);
      let linkedByNumber = false;

      for (const n of nums) {
        const candidates = byEstimateNumber.get(n) ?? [];
        if (candidates.length === 0) continue;

        const narrowed = disambiguateEstimatesForEmail({
          candidates,
          emailFromDomain: email.from_domain,
          emailProjectEstimateIds: projectEstimateIds.length
            ? projectEstimateIds
            : null,
        });

        if (narrowed.length !== 1) {
          skippedAmbiguous++;
          continue;
        }

        const est = narrowed[0]!;
        if (!dryRun) {
          const r = await insertLink.run(
            est.id,
            email.id,
            "estimate_number",
            `matched estimate_number=${n} (source=subject/body/attachments)`
          );
          linksInserted += r.count ?? 0;
        } else {
          linksInserted++;
        }
        linkedByNumber = true;
      }

      if (linkedByNumber) {
        continue;
      }

      // -------------------------------------------------------------------
      // Strategy 3: Project→estimate (only when single estimate on project).
      // -------------------------------------------------------------------
      if (projectEstimateIds.length === 1) {
        const estId = projectEstimateIds[0]!;
        if (!dryRun) {
          const r = await insertLink.run(
            estId,
            email.id,
            "project_estimates_single",
            `linked via project_id=${email.project_id}`
          );
          linksInserted += r.count ?? 0;
        } else {
          linksInserted++;
        }
        continue;
      }

      skippedNoSignal++;
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
