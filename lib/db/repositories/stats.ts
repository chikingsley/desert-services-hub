/**
 * Statistics & Cleanup Functions
 */
import { db } from "@lib/db/client";
import { parseEmailRow } from "@lib/db/repositories/email";
import type {
  ClassificationStats,
  Email,
  EmailClassification,
} from "@lib/db/types";

// ============================================
// Statistics
// ============================================

export async function getClassificationDistribution(): Promise<
  ClassificationStats[]
> {
  const rows = await db
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

export async function getLowConfidenceEmails(
  threshold = 0.7,
  limit = 50
): Promise<Email[]> {
  const rows = await db
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

export async function getEmailCountByMailbox(): Promise<
  Array<{
    email: string;
    count: number;
  }>
> {
  const rows = await db
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

export async function getTotalEmailCount(): Promise<number> {
  const result = await db
    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM emails")
    .get();
  return result?.count ?? 0;
}

export async function getDateRange(): Promise<{
  earliest: string | null;
  latest: string | null;
}> {
  const result = await db
    .query<{ earliest: string | null; latest: string | null }, []>(
      "SELECT MIN(received_at) as earliest, MAX(received_at) as latest FROM emails"
    )
    .get();
  return result ?? { earliest: null, latest: null };
}

// ============================================
// Cleanup/Reset
// ============================================

export async function clearAllData(): Promise<void> {
  await db.run("DELETE FROM emails");
  await db.run("DELETE FROM mailboxes");
}

export async function clearClassifications(): Promise<void> {
  await db.run(
    `UPDATE emails
     SET classification = NULL,
         classification_confidence = NULL,
         classification_method = NULL`
  );
}

export async function clearProjectLinks(): Promise<void> {
  await db.run(
    `UPDATE emails
     SET project_name = NULL,
         contractor_name = NULL,
         monday_estimate_id = NULL,
         notion_project_id = NULL,
         account_id = NULL,
         project_id = NULL`
  );
}
