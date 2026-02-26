/**
 * Executed Rules Repository
 *
 * Audit trail for rule evaluations and action executions.
 * Part of Phase 0 (Unified Operations Platform).
 */

import { db } from "@lib/db/client";
import { parseJsonRecord } from "@lib/db/parsers";

// ============================================
// Types
// ============================================

export type ExecutedRuleStatus =
  | "pending"
  | "applying"
  | "applied"
  | "skipped"
  | "error";
export type ExecutedActionStatus = "pending" | "completed" | "error";
export type MatchReason = "static" | "learned_pattern" | "ai" | "system_preset";

export interface ExecutedRule {
  aiReasoning: string | null;
  createdAt: string;
  emailId: number;
  id: number;
  matchReason: MatchReason | null;
  ruleId: number | null;
  status: ExecutedRuleStatus;
  threadId: string | null;
}

export interface ExecutedAction {
  actionId: number | null;
  createdAt: string;
  errorMessage: string | null;
  executedRuleId: number;
  id: number;
  resultData: Record<string, unknown> | null;
  status: ExecutedActionStatus;
  type: string;
}

interface ExecutedRuleRow {
  ai_reasoning: string | null;
  created_at: string;
  email_id: number;
  id: number;
  match_reason: MatchReason | null;
  rule_id: number | null;
  status: ExecutedRuleStatus;
  thread_id: string | null;
}

interface ExecutedActionRow {
  action_id: number | null;
  created_at: string;
  error_message: string | null;
  executed_rule_id: number;
  id: number;
  result_data: unknown;
  status: ExecutedActionStatus;
  type: string;
}

// ============================================
// Row Parsers
// ============================================

function parseExecutedRuleRow(row: ExecutedRuleRow): ExecutedRule {
  return {
    id: row.id,
    emailId: row.email_id,
    ruleId: row.rule_id,
    threadId: row.thread_id,
    status: row.status,
    matchReason: row.match_reason,
    aiReasoning: row.ai_reasoning,
    createdAt: row.created_at,
  };
}

function parseExecutedActionRow(row: ExecutedActionRow): ExecutedAction {
  const resultData = parseJsonRecord(row.result_data);

  return {
    id: row.id,
    executedRuleId: row.executed_rule_id,
    actionId: row.action_id,
    type: row.type,
    status: row.status,
    resultData,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

// ============================================
// Executed Rules
// ============================================

export async function insertExecutedRule(input: {
  emailId: number;
  ruleId?: number | null;
  threadId?: string | null;
  status?: ExecutedRuleStatus;
  matchReason?: MatchReason | null;
  aiReasoning?: string | null;
}): Promise<ExecutedRule> {
  const rows = await db.run(
    `INSERT INTO executed_rules (email_id, rule_id, thread_id, status, match_reason, ai_reasoning)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      input.emailId,
      input.ruleId ?? null,
      input.threadId ?? null,
      input.status ?? "pending",
      input.matchReason ?? null,
      input.aiReasoning ?? null,
    ]
  );
  return parseExecutedRuleRow(rows[0] as ExecutedRuleRow);
}

export async function updateExecutedRuleStatus(
  id: number,
  status: ExecutedRuleStatus
): Promise<void> {
  await db.run("UPDATE executed_rules SET status = $1 WHERE id = $2", [
    status,
    id,
  ]);
}

export async function getExecutedRulesForEmail(
  emailId: number
): Promise<ExecutedRule[]> {
  const rows = await db
    .query<ExecutedRuleRow>(
      "SELECT * FROM executed_rules WHERE email_id = $1 ORDER BY created_at"
    )
    .all(emailId);
  return rows.map(parseExecutedRuleRow);
}

export async function getExecutedRulesForThread(
  threadId: string
): Promise<ExecutedRule[]> {
  const rows = await db
    .query<ExecutedRuleRow>(
      `SELECT * FROM executed_rules WHERE thread_id = $1 AND status = 'applied' ORDER BY created_at`
    )
    .all(threadId);
  return rows.map(parseExecutedRuleRow);
}

export async function getPreviouslyAppliedRuleIds(
  threadId: string
): Promise<Set<number>> {
  const rows = await db
    .query<{ rule_id: number }>(
      `SELECT DISTINCT rule_id FROM executed_rules
    WHERE thread_id = $1 AND status = 'applied' AND rule_id IS NOT NULL`
    )
    .all(threadId);
  return new Set(rows.map((r) => r.rule_id));
}

export async function listRecentExecutedRules(
  limit = 50
): Promise<ExecutedRule[]> {
  const rows = await db
    .query<ExecutedRuleRow>(
      "SELECT * FROM executed_rules ORDER BY created_at DESC LIMIT $1"
    )
    .all(limit);
  return rows.map(parseExecutedRuleRow);
}

// ============================================
// Executed Actions
// ============================================

export async function insertExecutedAction(input: {
  executedRuleId: number;
  actionId?: number | null;
  type: string;
  status?: ExecutedActionStatus;
  resultData?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<ExecutedAction> {
  const rows = await db.run(
    `INSERT INTO executed_actions (executed_rule_id, action_id, type, status, result_data, error_message)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      input.executedRuleId,
      input.actionId ?? null,
      input.type,
      input.status ?? "pending",
      input.resultData ? JSON.stringify(input.resultData) : null,
      input.errorMessage ?? null,
    ]
  );
  return parseExecutedActionRow(rows[0] as ExecutedActionRow);
}

export async function updateExecutedActionStatus(
  id: number,
  status: ExecutedActionStatus,
  resultData?: Record<string, unknown> | null,
  errorMessage?: string | null
): Promise<void> {
  const sets = ["status = $1"];
  const params: unknown[] = [status];
  let idx = 2;

  if (resultData !== undefined) {
    sets.push(`result_data = $${idx}`);
    params.push(resultData ? JSON.stringify(resultData) : null);
    idx++;
  }
  if (errorMessage !== undefined) {
    sets.push(`error_message = $${idx}`);
    params.push(errorMessage);
    idx++;
  }

  params.push(id);
  await db.run(
    `UPDATE executed_actions SET ${sets.join(", ")} WHERE id = $${idx}`,
    params
  );
}

export async function getActionsForExecutedRule(
  executedRuleId: number
): Promise<ExecutedAction[]> {
  const rows = await db
    .query<ExecutedActionRow>(
      "SELECT * FROM executed_actions WHERE executed_rule_id = $1 ORDER BY created_at"
    )
    .all(executedRuleId);
  return rows.map(parseExecutedActionRow);
}

export async function markEmailRulesEvaluated(emailId: number): Promise<void> {
  await db.run("UPDATE emails SET rules_evaluated_at = now() WHERE id = $1", [
    emailId,
  ]);
}
