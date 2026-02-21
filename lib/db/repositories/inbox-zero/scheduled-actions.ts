/**
 * Scheduled Actions Repository
 *
 * Manages delayed action execution for the rule engine.
 * Part of Phase 0 (Unified Operations Platform).
 */

import { db } from "@lib/db/client";

// ============================================
// Types
// ============================================

export type ScheduledActionStatus = "pending" | "executed" | "cancelled";

export interface ScheduledAction {
  actionId: number;
  createdAt: string;
  emailId: number;
  executedRuleId: number;
  id: number;
  scheduledFor: string;
  status: ScheduledActionStatus;
}

// ============================================
// Row Parser
// ============================================

function parseRow(row: Record<string, unknown>): ScheduledAction {
  return {
    id: row.id as number,
    executedRuleId: row.executed_rule_id as number,
    actionId: row.action_id as number,
    emailId: row.email_id as number,
    scheduledFor: row.scheduled_for as string,
    status: row.status as ScheduledActionStatus,
    createdAt: row.created_at as string,
  };
}

// ============================================
// Queries
// ============================================

export async function insertScheduledAction(input: {
  executedRuleId: number;
  actionId: number;
  emailId: number;
  scheduledFor: Date;
}): Promise<ScheduledAction> {
  const rows = await db.run(
    `INSERT INTO scheduled_actions (executed_rule_id, action_id, email_id, scheduled_for)
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [
      input.executedRuleId,
      input.actionId,
      input.emailId,
      input.scheduledFor.toISOString(),
    ]
  );
  return parseRow(rows[0] as Record<string, unknown>);
}

export async function getDueActions(limit = 50): Promise<ScheduledAction[]> {
  const rows = await db
    .query<Record<string, unknown>>(
      `SELECT * FROM scheduled_actions
    WHERE status = 'pending' AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT $1`
    )
    .all(limit);
  return rows.map(parseRow);
}

export async function markExecuted(id: number): Promise<void> {
  await db.run(
    `UPDATE scheduled_actions SET status = 'executed' WHERE id = $1`,
    [id]
  );
}

export async function cancelForExecutedRule(
  executedRuleId: number
): Promise<number> {
  const rows = await db.run(
    `UPDATE scheduled_actions SET status = 'cancelled'
    WHERE executed_rule_id = $1 AND status = 'pending'
    RETURNING id`,
    [executedRuleId]
  );
  return rows.length;
}

export async function countPending(): Promise<number> {
  const row = await db
    .query<Record<string, unknown>>(
      `SELECT COUNT(*)::int AS count FROM scheduled_actions WHERE status = 'pending'`
    )
    .get();
  return (row?.count as number) ?? 0;
}
