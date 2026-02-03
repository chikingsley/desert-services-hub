/**
 * Statistics & Cleanup Functions
 */
import { db } from "../connection";
import type { ClassificationStats, Email, EmailClassification } from "../types";
import { parseEmailRow } from "./email";

// ============================================
// Statistics
// ============================================

export function getClassificationDistribution(): ClassificationStats[] {
  const rows = db
    .query<{ classification: string | null; count: number }, []>(
      `SELECT classification, COUNT(*) as count
       FROM emails
       GROUP BY classification
       ORDER BY count DESC`
    )
    .all();

  return rows.map((row) => ({
    classification: row.classification as EmailClassification | null,
    count: row.count,
  }));
}

export function getLowConfidenceEmails(threshold = 0.7, limit = 50): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number, number]>(
      `SELECT * FROM emails
       WHERE classification IS NOT NULL
       AND classification_confidence < ?
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(threshold, limit);

  return rows.map(parseEmailRow);
}

export function getEmailCountByMailbox(): Array<{
  email: string;
  count: number;
}> {
  const rows = db
    .query<{ email: string; count: number }, []>(
      `SELECT m.email, COUNT(e.id) as count
       FROM mailboxes m
       LEFT JOIN emails e ON e.mailbox_id = m.id
       GROUP BY m.id
       ORDER BY count DESC`
    )
    .all();

  return rows;
}

export function getTotalEmailCount(): number {
  const result = db
    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM emails")
    .get();
  return result?.count ?? 0;
}

export function getDateRange(): {
  earliest: string | null;
  latest: string | null;
} {
  const result = db
    .query<{ earliest: string | null; latest: string | null }, []>(
      "SELECT MIN(received_at) as earliest, MAX(received_at) as latest FROM emails"
    )
    .get();
  return result ?? { earliest: null, latest: null };
}

// ============================================
// Cleanup/Reset
// ============================================

export function clearAllData(): void {
  db.run("DELETE FROM email_entities");
  db.run("DELETE FROM email_tasks");
  db.run("DELETE FROM emails");
  db.run("DELETE FROM mailboxes");
}

export function clearClassifications(): void {
  db.run(
    `UPDATE emails
     SET classification = NULL,
         classification_confidence = NULL,
         classification_method = NULL`
  );
}

export function clearProjectLinks(): void {
  db.run(
    `UPDATE emails
     SET project_name = NULL,
         contractor_name = NULL,
         monday_estimate_id = NULL,
         notion_project_id = NULL,
         account_id = NULL,
         project_id = NULL`
  );
}
