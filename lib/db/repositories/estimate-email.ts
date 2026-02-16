/**
 * Functions for linking emails to estimates.
 * Used by agents and scripts to associate emails with estimates.
 */
import { db } from "@lib/db/hub";
import { findEstimateCandidatesForEmail as findEstimateCandidatesForEmailInternal } from "@lib/db/repositories/estimate-email-matching";
import type {
  EstimateCandidateResult as EstimateCandidateResultInternal,
  EstimateMatchCandidate as EstimateMatchCandidateInternal,
  EstimateMatchContext as EstimateMatchContextInternal,
  EstimateMatchDecision as EstimateMatchDecisionInternal,
  EstimateMatchHintInput as EstimateMatchHintInputInternal,
  EstimateMatchReason as EstimateMatchReasonInternal,
} from "@lib/db/repositories/estimate-email-matching-types";
import { likeSearch } from "@lib/db/search";

/**
 * Link an email to an estimate.
 *
 * @param estimateId - The estimate ID (from estimates table)
 * @param emailId - The email ID (from emails table)
 * @param source - Who/what made this link: 'agent', 'script', 'manual'
 * @param detail - Optional detail about why this link was made
 */
export async function linkEmailToEstimate(
  estimateId: number,
  emailId: number,
  source: "agent" | "script" | "manual" = "manual",
  detail?: string
): Promise<boolean> {
  try {
    await db.run(
      `INSERT INTO estimate_emails (estimate_id, email_id, match_type, match_detail)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [estimateId, emailId, source, detail || null]
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Link multiple emails to an estimate.
 */
export async function linkEmailsToEstimate(
  estimateId: number,
  emailIds: number[],
  source: "agent" | "script" | "manual" = "manual",
  detail?: string
): Promise<number> {
  let linked = 0;
  for (const emailId of emailIds) {
    if (await linkEmailToEstimate(estimateId, emailId, source, detail)) {
      linked++;
    }
  }
  return linked;
}

/**
 * Remove a link between an email and estimate.
 */
export async function unlinkEmailFromEstimate(
  estimateId: number,
  emailId: number
): Promise<boolean> {
  const result = await db.run(
    "DELETE FROM estimate_emails WHERE estimate_id = ? AND email_id = ?",
    [estimateId, emailId]
  );
  return result.count > 0;
}

/**
 * Get all emails linked to an estimate.
 */
export async function getEstimateEmails(estimateId: number) {
  return await db
    .query<
      {
        email_id: number;
        subject: string;
        from_email: string;
        received_at: string;
        match_type: string;
        match_detail: string | null;
      },
      [number]
    >(`
    SELECT
      e.id as email_id,
      e.subject,
      e.from_email,
      e.received_at,
      ee.match_type,
      ee.match_detail
    FROM estimate_emails ee
    JOIN emails e ON ee.email_id = e.id
    WHERE ee.estimate_id = ?
    ORDER BY e.received_at ASC
  `)
    .all(estimateId);
}

/**
 * Get all estimates linked to an email.
 */
export async function getEmailEstimates(emailId: number) {
  return await db
    .query<
      {
        estimate_id: number;
        name: string;
        contractor: string | null;
        match_type: string;
      },
      [number]
    >(`
    SELECT
      est.id as estimate_id,
      est.name,
      est.contractor,
      ee.match_type
    FROM estimate_emails ee
    JOIN estimates est ON ee.estimate_id = est.id
    WHERE ee.email_id = ?
  `)
    .all(emailId);
}

/**
 * Find estimate by number or name pattern.
 */
export async function findEstimate(search: string) {
  return await likeSearch<{
    id: number;
    name: string;
    contractor: string | null;
    estimate_number: string | null;
    email_count: number;
  }>({
    table: "estimates e",
    select: `e.id, e.name, e.contractor, e.estimate_number,
      (SELECT COUNT(*) FROM estimate_emails ee WHERE ee.estimate_id = e.id) as email_count`,
    columns: ["e.estimate_number", "e.name"],
    query: search,
    limit: 20,
  });
}

/**
 * Find email by subject or ID.
 */
export async function findEmail(search: string | number) {
  if (typeof search === "number") {
    return await db
      .query<
        {
          id: number;
          subject: string;
          from_email: string;
          received_at: string;
        },
        [number]
      >("SELECT id, subject, from_email, received_at FROM emails WHERE id = ?")
      .get(search);
  }

  return await likeSearch<{
    id: number;
    subject: string;
    from_email: string;
    received_at: string;
  }>({
    table: "emails",
    select: "id, subject, from_email, received_at",
    columns: ["subject"],
    query: search,
    orderBy: "received_at DESC",
    limit: 20,
  });
}

export type EstimateMatchReason = EstimateMatchReasonInternal;
export type EstimateMatchCandidate = EstimateMatchCandidateInternal;
export type EstimateMatchDecision = EstimateMatchDecisionInternal;
export type EstimateMatchContext = EstimateMatchContextInternal;
export type EstimateMatchHintInput = EstimateMatchHintInputInternal;
export type EstimateCandidateResult = EstimateCandidateResultInternal;

export async function findEstimateCandidatesForEmail(
  emailId: number,
  hints: EstimateMatchHintInput = {}
): Promise<EstimateCandidateResult | null> {
  return await findEstimateCandidatesForEmailInternal(emailId, hints);
}
