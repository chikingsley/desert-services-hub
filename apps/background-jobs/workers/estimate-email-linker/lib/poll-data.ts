/**
 * Types, extraction utilities, and data access for the estimate email linker.
 * Extracted from poll.ts to stay under the 500-line limit.
 */
import { db } from "@lib/db/hub";

// ── Types ─────────────────────────────────────────────────────────────

export interface EmailRow {
  id: number;
  subject: string | null;
  normalized_subject: string | null;
  attachment_names: string | null; // JSON array string
  body_preview: string | null;
  from_domain: string | null;
  project_id: number | null;
  received_at: string;
}

export interface EstimateIndexRow {
  id: number;
  monday_item_id: string | null;
  estimate_number: string | null;
  account_domain: string | null;
  name: string;
}

// ── Small utilities ───────────────────────────────────────────────────

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function safeJsonArray(value: string | null): string[] {
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

// ── Signal extraction ─────────────────────────────────────────────────

export function extractMondayPulseIds(text: string): string[] {
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

export function extractEstimateNumbers(text: string): string[] {
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

// ── Data access ───────────────────────────────────────────────────────

export async function buildEstimateIndex(): Promise<{
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

export async function fetchProjectEstimates(
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

// ── Disambiguation ────────────────────────────────────────────────────

export function disambiguateEstimatesForEmail(opts: {
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
