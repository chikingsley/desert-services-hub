/**
 * Inbox Stats API
 *
 * GET /api/inbox/stats — counts per mailbox and per classification
 *
 * Provides the numbers needed for mailbox tabs and classification
 * filter badges. Cached for 30 seconds to avoid expensive aggregations
 * on every page load.
 */

import { db } from "@lib/db/client";

interface MailboxCount {
  count: number;
  displayName: string | null;
  email: string;
  id: number;
}

interface ClassificationCount {
  classification: string;
  count: number;
}

interface InboxStats {
  byClassification: ClassificationCount[];
  byMailbox: MailboxCount[];
  recentCount: number;
  total: number;
}

const CACHE_TTL_MS = 30_000;
let cached: { expiresAt: number; value: InboxStats } | null = null;

export async function getInboxStats(_req: Request): Promise<Response> {
  try {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return Response.json(cached.value);
    }

    const [mailboxRows, classificationRows, totalRow, recentRow] =
      await Promise.all([
        db
          .query(
            `SELECT
               m.id, m.email, m.display_name,
               COUNT(e.id)::int AS count
             FROM mailboxes m
             LEFT JOIN emails e ON e.mailbox_id = m.id AND e.is_excluded = 0
             GROUP BY m.id, m.email, m.display_name
             HAVING COUNT(e.id) > 0
             ORDER BY count DESC`
          )
          .all() as Promise<Record<string, unknown>[]>,
        db
          .query(
            `SELECT
               classification,
               COUNT(*)::int AS count
             FROM emails
             WHERE is_excluded = 0 AND classification IS NOT NULL
             GROUP BY classification
             ORDER BY count DESC`
          )
          .all() as Promise<Record<string, unknown>[]>,
        db
          .query(
            "SELECT COUNT(*)::int AS total FROM emails WHERE is_excluded = 0"
          )
          .get() as Promise<Record<string, unknown> | null>,
        db
          .query(
            `SELECT COUNT(*)::int AS count
             FROM emails
             WHERE is_excluded = 0
               AND received_at > now() - interval '24 hours'`
          )
          .get() as Promise<Record<string, unknown> | null>,
      ]);

    const stats: InboxStats = {
      total: (totalRow?.total as number) ?? 0,
      recentCount: (recentRow?.count as number) ?? 0,
      byMailbox: mailboxRows.map((r) => ({
        id: r.id as number,
        email: r.email as string,
        displayName: r.display_name as string | null,
        count: r.count as number,
      })),
      byClassification: classificationRows.map((r) => ({
        classification: r.classification as string,
        count: r.count as number,
      })),
    };

    cached = { expiresAt: now + CACHE_TTL_MS, value: stats };
    return Response.json(stats);
  } catch (error) {
    console.error("Failed to fetch inbox stats:", error);
    return Response.json(
      { error: "Failed to fetch inbox stats" },
      { status: 500 }
    );
  }
}
