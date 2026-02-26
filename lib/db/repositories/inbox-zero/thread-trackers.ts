/**
 * Thread Trackers Repository
 *
 * Tracks conversation state: to_reply, awaiting_reply, fyi, resolved.
 * Part of Phase 0 (Unified Operations Platform).
 */

import { db } from "@lib/db/client";

// ============================================
// Types
// ============================================

export type ThreadTrackerStatus =
  | "to_reply"
  | "awaiting_reply"
  | "fyi"
  | "resolved";

export interface ThreadTracker {
  assignedTo: string | null;
  conversationId: string;
  createdAt: string;
  emailId: number;
  id: number;
  projectId: number | null;
  resolvedAt: string | null;
  status: ThreadTrackerStatus;
  updatedAt: string;
}

// ============================================
// Row Parser
// ============================================

interface ThreadTrackerRow {
  assigned_to: string | null;
  conversation_id: string;
  created_at: string;
  email_id: number;
  id: number;
  project_id: number | null;
  resolved_at: string | null;
  status: ThreadTrackerStatus;
  updated_at: string;
}

interface ThreadTrackerStatusCountRow {
  count: number;
  status: ThreadTrackerStatus;
}

function parseRow(row: ThreadTrackerRow): ThreadTracker {
  return {
    id: row.id,
    emailId: row.email_id,
    conversationId: row.conversation_id,
    projectId: row.project_id,
    status: row.status,
    assignedTo: row.assigned_to,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================
// Queries
// ============================================

export async function upsertTracker(input: {
  emailId: number;
  conversationId: string;
  projectId?: number | null;
  status: ThreadTrackerStatus;
  assignedTo?: string | null;
}): Promise<ThreadTracker> {
  const rows = await db.run(
    `INSERT INTO thread_trackers (email_id, conversation_id, project_id, status, assigned_to)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (conversation_id, status) DO UPDATE SET
      email_id = EXCLUDED.email_id,
      project_id = COALESCE(EXCLUDED.project_id, thread_trackers.project_id),
      assigned_to = COALESCE(EXCLUDED.assigned_to, thread_trackers.assigned_to),
      updated_at = now()
    RETURNING *`,
    [
      input.emailId,
      input.conversationId,
      input.projectId ?? null,
      input.status,
      input.assignedTo ?? null,
    ]
  );
  return parseRow(rows[0] as ThreadTrackerRow);
}

export async function resolveTracker(conversationId: string): Promise<void> {
  await db.run(
    `UPDATE thread_trackers
    SET status = 'resolved', resolved_at = now(), updated_at = now()
    WHERE conversation_id = $1 AND status != 'resolved'`,
    [conversationId]
  );
}

export async function getActiveTrackersForConversation(
  conversationId: string
): Promise<ThreadTracker[]> {
  const rows = await db
    .query<ThreadTrackerRow>(
      `SELECT * FROM thread_trackers
    WHERE conversation_id = $1 AND status != 'resolved'
    ORDER BY created_at DESC`
    )
    .all(conversationId);
  return rows.map(parseRow);
}

export async function getTrackersForProject(
  projectId: number
): Promise<ThreadTracker[]> {
  const rows = await db
    .query<ThreadTrackerRow>(
      `SELECT * FROM thread_trackers
    WHERE project_id = $1 AND status != 'resolved'
    ORDER BY updated_at DESC`
    )
    .all(projectId);
  return rows.map(parseRow);
}

export async function listActiveTrackers(options?: {
  status?: ThreadTrackerStatus;
  projectId?: number;
  limit?: number;
}): Promise<ThreadTracker[]> {
  const conditions = ["status != 'resolved'"];
  const params: unknown[] = [];
  let idx = 1;

  if (options?.status) {
    conditions.push(`status = $${idx}`);
    params.push(options.status);
    idx++;
  }
  if (options?.projectId) {
    conditions.push(`project_id = $${idx}`);
    params.push(options.projectId);
    idx++;
  }

  const limit = options?.limit ?? 100;
  params.push(limit);

  const rows = await db
    .query<ThreadTrackerRow>(
      `SELECT * FROM thread_trackers
    WHERE ${conditions.join(" AND ")}
    ORDER BY updated_at DESC
    LIMIT $${idx}`
    )
    .all(...params);
  return rows.map(parseRow);
}

export async function countActiveByStatus(): Promise<
  Record<ThreadTrackerStatus, number>
> {
  const rows = await db
    .query<ThreadTrackerStatusCountRow>(
      `SELECT status, COUNT(*)::int AS count FROM thread_trackers
    WHERE status != 'resolved'
    GROUP BY status`
    )
    .all();

  const counts: Record<string, number> = {
    to_reply: 0,
    awaiting_reply: 0,
    fyi: 0,
    resolved: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts as Record<ThreadTrackerStatus, number>;
}
