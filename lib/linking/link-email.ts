/**
 * Unified Deterministic Email Linker
 *
 * Single entry point: linkEmail(emailId)
 *
 * Runs all deterministic signals in priority order to link an email to its
 * project and/or estimate. Designed to be called both inline (on email sync)
 * and from the batch timer.
 *
 * Signal priority:
 *   1. Conversation → project (sibling in same thread already has project_id)
 *   2. Pulse ID → estimate (Monday item ID in subject/body/attachments)
 *   3. Estimate number → estimate (Est_XXXXXXXX pattern matching)
 *   4. Estimate → project (linked estimate maps to exactly 1 project)
 *   5. Project → single estimate (project has exactly 1 estimate)
 *
 * All writes are idempotent:
 *   - linkEmailToProject skips if project_id already set
 *   - linkEmailToEstimate uses ON CONFLICT DO NOTHING
 */
import { db } from "@lib/db/hub";
import { linkEmailToEstimate } from "@lib/db/repositories/estimate-email";
import { linkEmailToProject } from "@lib/db/repositories/project";

// ── Signal extraction (shared with batch linker) ─────────────────────
const ESTIMATE_SIGNAL_ID_RE = /estimate:(\d+)/;

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

export function extractMondayPulseIds(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/(?:pulses|items)\/(\d{6,})/gi)) {
    if (match[1]) {
      ids.push(match[1]);
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

  for (const match of text.matchAll(
    /\bEst(?:imate)?[_\s-]*([0-9]{6,8})(?:\s*-?\s*R[0-9]+)?\b/gi
  )) {
    const n = normalizeEstimateNumberDigits(match[1] ?? "");
    if (n) {
      out.push(n);
    }
  }

  for (const match of text.matchAll(/\bEstimate[:\s#]*([0-9]{6,8})\b/gi)) {
    const n = normalizeEstimateNumberDigits(match[1] ?? "");
    if (n) {
      out.push(n);
    }
  }

  return uniq(out);
}

// ── Per-email DB lookups ─────────────────────────────────────────────

interface EmailForLinking {
  id: number;
  subject: string | null;
  normalized_subject: string | null;
  body_preview: string | null;
  attachment_names: string | null;
  from_domain: string | null;
  project_id: number | null;
  conversation_id: string | null;
}

const getEmailForLinking = db.query<EmailForLinking, [number]>(
  `SELECT id, subject, normalized_subject, body_preview, attachment_names,
          from_domain, project_id, conversation_id
   FROM emails WHERE id = ?`
);

const getConversationProject = db.query<
  { project_id: number },
  [string, number]
>(
  `SELECT project_id FROM emails
   WHERE conversation_id = ? AND project_id IS NOT NULL AND id != ?
   LIMIT 1`
);

interface EstimateLookupRow {
  id: number;
  account_domain: string | null;
}

const getEstimateByMondayItemId = db.query<EstimateLookupRow, [string]>(
  "SELECT id, account_domain FROM estimates WHERE monday_item_id = ?"
);

const getEstimatesByNumber = db.query<EstimateLookupRow, [string]>(
  "SELECT id, account_domain FROM estimates WHERE estimate_number = ?"
);

const getProjectEstimateIds = db.query<{ estimate_id: number }, [number]>(
  "SELECT estimate_id FROM project_estimates WHERE project_id = ?"
);

const getProjectForEstimateLinks = db.query<{ project_id: number }, [number]>(
  `SELECT DISTINCT pe.project_id
   FROM estimate_emails ee
   JOIN project_estimates pe ON pe.estimate_id = ee.estimate_id
   WHERE ee.email_id = ?`
);

const hasEstimateLink = db.query<{ cnt: string }, [number]>(
  "SELECT COUNT(*) AS cnt FROM estimate_emails WHERE email_id = ?"
);

const getProjectName = db.query<{ name: string }, [number]>(
  "SELECT name FROM projects WHERE id = ?"
);

const getEstimateName = db.query<
  { estimate_number: string | null; name: string | null },
  [number]
>("SELECT estimate_number, name FROM estimates WHERE id = ?");

// ── Public API ───────────────────────────────────────────────────────

export interface LinkEmailResult {
  projectLinked: boolean;
  estimateLinked: boolean;
  signals: string[];
}

interface LinkState {
  projectId: number | null;
  hasEstimate: boolean;
  signals: string[];
}

function buildHaystack(email: EmailForLinking): string {
  return [
    email.subject ?? "",
    email.normalized_subject ?? "",
    email.body_preview ?? "",
    ...safeJsonArray(email.attachment_names),
  ]
    .filter(Boolean)
    .join("\n");
}

async function applyConversationProjectSignal(
  email: EmailForLinking,
  emailId: number,
  state: LinkState
): Promise<void> {
  if (state.projectId || !email.conversation_id) {
    return;
  }

  const sibling = await getConversationProject.get(
    email.conversation_id,
    emailId
  );
  if (!sibling?.project_id) {
    return;
  }

  await linkEmailToProject(emailId, sibling.project_id);
  state.projectId = sibling.project_id;
  state.signals.push(`conversation→project:${state.projectId}`);
}

async function applyPulseSignal(
  haystack: string,
  emailId: number,
  state: LinkState
): Promise<void> {
  if (state.hasEstimate) {
    return;
  }

  const pulseIds = extractMondayPulseIds(haystack);
  for (const pid of pulseIds) {
    const est = await getEstimateByMondayItemId.get(pid);
    if (!est) {
      continue;
    }

    const linked = await linkEmailToEstimate(
      est.id,
      emailId,
      "script",
      `pulse_id=${pid}`
    );
    if (linked) {
      state.hasEstimate = true;
      state.signals.push(`pulse_id→estimate:${est.id}`);
    }
  }
}

async function tryLinkEstimateByProject(
  candidates: EstimateLookupRow[],
  projectId: number,
  num: string,
  emailId: number,
  state: LinkState
): Promise<boolean> {
  const projEstRows = await getProjectEstimateIds.all(projectId);
  const projEstSet = new Set(projEstRows.map((r) => r.estimate_id));
  const match = candidates.find((c) => projEstSet.has(c.id));
  if (!match) {
    return false;
  }

  const linked = await linkEmailToEstimate(
    match.id,
    emailId,
    "script",
    `estimate_number=${num} disambiguated_by=project:${projectId}`
  );
  if (!linked) {
    return false;
  }

  state.hasEstimate = true;
  state.signals.push(`estimate_number+project→estimate:${match.id}`);
  return true;
}

async function tryLinkEstimateByDomain(
  candidates: EstimateLookupRow[],
  domain: string,
  num: string,
  emailId: number,
  state: LinkState
): Promise<boolean> {
  const normalizedDomain = domain.toLowerCase();
  const match = candidates.find(
    (candidate) =>
      (candidate.account_domain ?? "").toLowerCase() === normalizedDomain
  );
  if (!match) {
    return false;
  }

  const linked = await linkEmailToEstimate(
    match.id,
    emailId,
    "script",
    `estimate_number=${num} disambiguated_by=domain:${normalizedDomain}`
  );
  if (!linked) {
    return false;
  }

  state.hasEstimate = true;
  state.signals.push(`estimate_number+domain→estimate:${match.id}`);
  return true;
}

async function applyEstimateNumberSignal(
  haystack: string,
  email: EmailForLinking,
  emailId: number,
  state: LinkState
): Promise<void> {
  if (state.hasEstimate) {
    return;
  }

  const numbers = extractEstimateNumbers(haystack);
  for (const number of numbers) {
    const candidates = await getEstimatesByNumber.all(number);
    const linked = await tryLinkEstimateFromCandidates(
      candidates,
      number,
      email,
      emailId,
      state
    );
    if (linked) {
      break;
    }
  }
}

async function tryLinkEstimateFromCandidates(
  candidates: EstimateLookupRow[],
  estimateNumber: string,
  email: EmailForLinking,
  emailId: number,
  state: LinkState
): Promise<boolean> {
  if (candidates.length === 1 && candidates[0]) {
    const linked = await linkEmailToEstimate(
      candidates[0].id,
      emailId,
      "script",
      `estimate_number=${estimateNumber}`
    );
    if (linked) {
      state.hasEstimate = true;
      state.signals.push(`estimate_number→estimate:${candidates[0].id}`);
      return true;
    }
    return false;
  }

  if (candidates.length <= 1) {
    return false;
  }

  if (state.projectId) {
    const linkedByProject = await tryLinkEstimateByProject(
      candidates,
      state.projectId,
      estimateNumber,
      emailId,
      state
    );
    if (linkedByProject) {
      return true;
    }
  }

  if (!state.hasEstimate && email.from_domain) {
    const linkedByDomain = await tryLinkEstimateByDomain(
      candidates,
      email.from_domain,
      estimateNumber,
      emailId,
      state
    );
    if (linkedByDomain) {
      return true;
    }
  }

  return false;
}

async function applyEstimateToProjectSignal(
  emailId: number,
  state: LinkState
): Promise<void> {
  if (state.projectId === null && state.hasEstimate) {
    const projectRows = await getProjectForEstimateLinks.all(emailId);
    if (projectRows.length === 1 && projectRows[0]) {
      await linkEmailToProject(emailId, projectRows[0].project_id);
      state.projectId = projectRows[0].project_id;
      state.signals.push(`estimate→project:${state.projectId}`);
    }
  }
}

async function applyProjectToSingleEstimateSignal(
  emailId: number,
  state: LinkState
): Promise<void> {
  if (state.projectId === null || state.hasEstimate) {
    return;
  }

  const estRows = await getProjectEstimateIds.all(state.projectId);
  if (estRows.length === 1 && estRows[0]) {
    const linked = await linkEmailToEstimate(
      estRows[0].estimate_id,
      emailId,
      "script",
      `project_single project_id=${state.projectId}`
    );
    if (linked) {
      state.hasEstimate = true;
      state.signals.push(`project_single→estimate:${estRows[0].estimate_id}`);
    }
  }
}

/**
 * Run all deterministic signals to link an email to its project/estimate.
 * Idempotent — safe to call multiple times on the same email.
 */
export async function linkEmail(emailId: number): Promise<LinkEmailResult> {
  const email = await getEmailForLinking.get(emailId);
  if (!email) {
    return { projectLinked: false, estimateLinked: false, signals: [] };
  }

  const state: LinkState = {
    projectId: email.project_id,
    hasEstimate: Number((await hasEstimateLink.get(emailId))?.cnt ?? "0") > 0,
    signals: [],
  };
  const haystack = buildHaystack(email);

  const hadProject = email.project_id !== null;
  const hadEstimate = state.hasEstimate;

  await applyConversationProjectSignal(email, emailId, state);
  await applyPulseSignal(haystack, emailId, state);
  await applyEstimateNumberSignal(haystack, email, emailId, state);
  await applyEstimateToProjectSignal(emailId, state);
  await applyProjectToSingleEstimateSignal(emailId, state);

  // Log when we actually linked something new
  if (state.signals.length > 0) {
    const parts: string[] = [`email #${emailId}`];
    const subjectSnippet = (email.subject ?? "").slice(0, 60);
    if (subjectSnippet) {
      parts.push(`"${subjectSnippet}"`);
    }

    if (!hadProject && state.projectId !== null) {
      const proj = await getProjectName.get(state.projectId);
      parts.push(`→ project #${state.projectId} (${proj?.name ?? "unknown"})`);
    }

    if (!hadEstimate && state.hasEstimate) {
      // Find which estimate from the signals
      const estSignal = state.signals.find((s) => s.includes("→estimate:"));
      const estIdMatch = estSignal?.match(ESTIMATE_SIGNAL_ID_RE);
      if (estIdMatch?.[1]) {
        const est = await getEstimateName.get(Number(estIdMatch[1]));
        parts.push(
          `→ estimate #${estIdMatch[1]} (${est?.estimate_number ?? est?.name ?? "unknown"})`
        );
      }
    }

    parts.push(`[${state.signals.join(", ")}]`);
    console.log(`[link-email] ${parts.join(" ")}`);
  }

  return {
    projectLinked: state.projectId !== null,
    estimateLinked: state.hasEstimate,
    signals: state.signals,
  };
}
