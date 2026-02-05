/**
 * Functions for linking emails to estimates.
 * Used by agents and scripts to associate emails with estimates.
 */
import { db } from "@contract/db/connection";

/**
 * Link an email to an estimate.
 *
 * @param estimateId - The estimate ID (from estimates table)
 * @param emailId - The email ID (from emails table)
 * @param source - Who/what made this link: 'agent', 'script', 'manual'
 * @param detail - Optional detail about why this link was made
 */
export function linkEmailToEstimate(
  estimateId: number,
  emailId: number,
  source: "agent" | "script" | "manual" = "manual",
  detail?: string
): boolean {
  try {
    db.run(
      `INSERT OR IGNORE INTO estimate_emails (estimate_id, email_id, match_type, match_detail)
       VALUES (?, ?, ?, ?)`,
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
export function linkEmailsToEstimate(
  estimateId: number,
  emailIds: number[],
  source: "agent" | "script" | "manual" = "manual",
  detail?: string
): number {
  let linked = 0;
  for (const emailId of emailIds) {
    if (linkEmailToEstimate(estimateId, emailId, source, detail)) {
      linked++;
    }
  }
  return linked;
}

/**
 * Remove a link between an email and estimate.
 */
export function unlinkEmailFromEstimate(
  estimateId: number,
  emailId: number
): boolean {
  const result = db.run(
    "DELETE FROM estimate_emails WHERE estimate_id = ? AND email_id = ?",
    [estimateId, emailId]
  );
  return result.changes > 0;
}

/**
 * Get all emails linked to an estimate.
 */
export function getEstimateEmails(estimateId: number) {
  return db
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
export function getEmailEstimates(emailId: number) {
  return db
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
export function findEstimate(search: string) {
  return db
    .query<
      {
        id: number;
        name: string;
        contractor: string | null;
        estimate_number: string | null;
        email_count: number;
      },
      [string, string]
    >(`
    SELECT 
      e.id,
      e.name,
      e.contractor,
      e.estimate_number,
      (SELECT COUNT(*) FROM estimate_emails ee WHERE ee.estimate_id = e.id) as email_count
    FROM estimates e
    WHERE e.estimate_number = ? OR LOWER(e.name) LIKE '%' || LOWER(?) || '%'
    LIMIT 20
  `)
    .all(search, search);
}

/**
 * Find email by subject or ID.
 */
export function findEmail(search: string | number) {
  if (typeof search === "number") {
    return db
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

  return db
    .query<
      {
        id: number;
        subject: string;
        from_email: string;
        received_at: string;
      },
      [string]
    >(`
    SELECT id, subject, from_email, received_at 
    FROM emails 
    WHERE LOWER(subject) LIKE '%' || LOWER(?) || '%'
    ORDER BY received_at DESC
    LIMIT 20
  `)
    .all(search);
}
