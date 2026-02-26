/**
 * Draft Queue Repository
 *
 * Manages the lifecycle of LLM-generated email drafts.
 * Part of Phase 0 (Unified Operations Platform).
 */

import { db } from "@lib/db/client";
import { parseJsonRecord } from "@lib/db/parsers";

// ============================================
// Types
// ============================================

export type DraftStatus =
  | "pending"
  | "generated"
  | "approved"
  | "edited"
  | "rejected"
  | "sent";

export interface DraftQueueItem {
  contextSnapshot: Record<string, unknown> | null;
  createdAt: string;
  emailId: number | null;
  finalBody: string | null;
  generatedBody: string | null;
  graphDraftId: string | null;
  id: number;
  mailboxId: number | null;
  projectId: number | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  ruleId: number | null;
  status: DraftStatus;
}

interface DraftQueueRow {
  context_snapshot: unknown;
  created_at: string;
  email_id: number | null;
  final_body: string | null;
  generated_body: string | null;
  graph_draft_id: string | null;
  id: number;
  mailbox_id: number | null;
  project_id: number | null;
  resolved_at: string | null;
  resolved_by: string | null;
  rule_id: number | null;
  status: DraftStatus;
}

interface DraftStatusCountRow {
  count: number;
  status: DraftStatus;
}

// ============================================
// Row Parser
// ============================================

function parseRow(row: DraftQueueRow): DraftQueueItem {
  const contextSnapshot = parseJsonRecord(row.context_snapshot);

  return {
    id: row.id,
    emailId: row.email_id,
    projectId: row.project_id,
    ruleId: row.rule_id,
    graphDraftId: row.graph_draft_id,
    mailboxId: row.mailbox_id,
    status: row.status,
    generatedBody: row.generated_body,
    finalBody: row.final_body,
    contextSnapshot,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
}

// ============================================
// Queries
// ============================================

export async function insertDraft(input: {
  emailId?: number | null;
  projectId?: number | null;
  ruleId?: number | null;
  graphDraftId?: string | null;
  mailboxId?: number | null;
  status?: DraftStatus;
  generatedBody?: string | null;
  contextSnapshot?: Record<string, unknown> | null;
}): Promise<DraftQueueItem> {
  const rows = await db.run(
    `INSERT INTO draft_queue (email_id, project_id, rule_id, graph_draft_id, mailbox_id, status, generated_body, context_snapshot)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      input.emailId ?? null,
      input.projectId ?? null,
      input.ruleId ?? null,
      input.graphDraftId ?? null,
      input.mailboxId ?? null,
      input.status ?? "pending",
      input.generatedBody ?? null,
      input.contextSnapshot ? JSON.stringify(input.contextSnapshot) : null,
    ]
  );
  return parseRow(rows[0] as DraftQueueRow);
}

export async function getDraft(id: number): Promise<DraftQueueItem | null> {
  const row = await db
    .query<DraftQueueRow>("SELECT * FROM draft_queue WHERE id = $1")
    .get(id);
  return row ? parseRow(row) : null;
}

export async function updateDraftStatus(
  id: number,
  status: DraftStatus,
  extra?: {
    graphDraftId?: string;
    generatedBody?: string;
    finalBody?: string;
    resolvedBy?: string;
  }
): Promise<DraftQueueItem | null> {
  const sets = ["status = $1"];
  const params: unknown[] = [status];
  let idx = 2;

  if (
    status === "approved" ||
    status === "edited" ||
    status === "rejected" ||
    status === "sent"
  ) {
    sets.push("resolved_at = now()");
  }

  if (extra?.graphDraftId !== undefined) {
    sets.push(`graph_draft_id = $${idx}`);
    params.push(extra.graphDraftId);
    idx++;
  }
  if (extra?.generatedBody !== undefined) {
    sets.push(`generated_body = $${idx}`);
    params.push(extra.generatedBody);
    idx++;
  }
  if (extra?.finalBody !== undefined) {
    sets.push(`final_body = $${idx}`);
    params.push(extra.finalBody);
    idx++;
  }
  if (extra?.resolvedBy !== undefined) {
    sets.push(`resolved_by = $${idx}`);
    params.push(extra.resolvedBy);
    idx++;
  }

  params.push(id);
  const rows = await db.run(
    `UPDATE draft_queue SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );
  return rows[0] ? parseRow(rows[0] as DraftQueueRow) : null;
}

export async function listDrafts(options?: {
  status?: DraftStatus;
  projectId?: number;
  limit?: number;
}): Promise<DraftQueueItem[]> {
  const conditions: string[] = [];
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

  const limit = options?.limit ?? 50;
  params.push(limit);

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db
    .query<DraftQueueRow>(
      `SELECT * FROM draft_queue ${where} ORDER BY created_at DESC LIMIT $${idx}`
    )
    .all(...params);
  return rows.map(parseRow);
}

export async function countDraftsByStatus(): Promise<
  Record<DraftStatus, number>
> {
  const rows = await db
    .query<DraftStatusCountRow>(
      "SELECT status, COUNT(*)::int AS count FROM draft_queue GROUP BY status"
    )
    .all();

  const counts: Record<string, number> = {
    pending: 0,
    generated: 0,
    approved: 0,
    edited: 0,
    rejected: 0,
    sent: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts as Record<DraftStatus, number>;
}
