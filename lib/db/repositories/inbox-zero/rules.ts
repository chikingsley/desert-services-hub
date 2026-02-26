/**
 * Rules Repository
 *
 * CRUD for rules, rule_actions, rule_groups, and rule_group_items.
 * Part of Phase 0 (Unified Operations Platform).
 */

import { db } from "@lib/db/client";
import { parseBoolInt, parseJsonArray } from "@lib/db/parsers";

// ============================================
// Types
// ============================================

export type RuleConditionOperator = "AND" | "OR";

export type RuleActionType =
  | "draft_reply"
  | "reply"
  | "forward"
  | "label"
  | "archive"
  | "webhook"
  | "create_task"
  | "link_project"
  | "enqueue_job";

export type RuleSystemType = "TO_REPLY" | "AWAITING_REPLY" | "FYI" | null;

export interface Rule {
  conditionBody: string | null;
  conditionClassification: string[];
  conditionFrom: string | null;
  conditionOperator: RuleConditionOperator;
  conditionSubject: string | null;
  conditionTo: string | null;
  createdAt: string;
  enabled: boolean;
  groupId: number | null;
  id: number;
  instructions: string | null;
  name: string;
  runOnThreads: boolean;
  sortOrder: number;
  systemType: string | null;
  updatedAt: string;
}

export interface RuleAction {
  contentTemplate: string | null;
  createdAt: string;
  delayMinutes: number;
  id: number;
  jobType: string | null;
  label: string | null;
  ruleId: number;
  sortOrder: number;
  subjectTemplate: string | null;
  toAddress: string | null;
  type: RuleActionType;
  webhookUrl: string | null;
}

export interface RuleWithActions extends Rule {
  actions: RuleAction[];
}

export interface RuleGroup {
  createdAt: string;
  id: number;
  name: string;
  ruleId: number | null;
}

export interface RuleGroupItem {
  createdAt: string;
  groupId: number;
  id: number;
  isExclusion: boolean;
  type: "from" | "subject" | "domain";
  value: string;
}

export interface RuleGroupWithItems extends RuleGroup {
  items: RuleGroupItem[];
}

// ============================================
// Row Parsers
// ============================================

interface RuleRow {
  condition_body: string | null;
  condition_classification: unknown;
  condition_from: string | null;
  condition_operator: RuleConditionOperator | null;
  condition_subject: string | null;
  condition_to: string | null;
  created_at: string;
  enabled: boolean | number | null;
  group_id: number | null;
  id: number;
  instructions: string | null;
  name: string;
  run_on_threads: boolean | number | null;
  sort_order: number | null;
  system_type: RuleSystemType;
  updated_at: string;
}

interface RuleActionRow {
  content_template: string | null;
  created_at: string;
  delay_minutes: number | null;
  id: number;
  job_type: string | null;
  label: string | null;
  rule_id: number;
  sort_order: number | null;
  subject_template: string | null;
  to_address: string | null;
  type: RuleActionType;
  webhook_url: string | null;
}

interface RuleGroupRow {
  created_at: string;
  id: number;
  name: string;
  rule_id: number | null;
}

interface RuleGroupItemRow {
  created_at: string;
  group_id: number;
  id: number;
  is_exclusion: boolean | number | null;
  type: "from" | "subject" | "domain";
  value: string;
}

function parseRuleRow(row: RuleRow): Rule {
  const classification = parseJsonArray(row.condition_classification)
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);

  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    conditionFrom: row.condition_from,
    conditionTo: row.condition_to,
    conditionSubject: row.condition_subject,
    conditionBody: row.condition_body,
    conditionOperator: row.condition_operator ?? "AND",
    conditionClassification: classification,
    runOnThreads: parseBoolInt(row.run_on_threads),
    enabled: parseBoolInt(row.enabled),
    sortOrder: Number(row.sort_order ?? 0),
    groupId: row.group_id,
    systemType: row.system_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseActionRow(row: RuleActionRow): RuleAction {
  return {
    id: row.id,
    ruleId: row.rule_id,
    type: row.type,
    label: row.label,
    toAddress: row.to_address,
    subjectTemplate: row.subject_template,
    contentTemplate: row.content_template,
    webhookUrl: row.webhook_url,
    jobType: row.job_type,
    delayMinutes: Number(row.delay_minutes ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
  };
}

function parseGroupRow(row: RuleGroupRow): RuleGroup {
  return {
    id: row.id,
    name: row.name,
    ruleId: row.rule_id,
    createdAt: row.created_at,
  };
}

function parseGroupItemRow(row: RuleGroupItemRow): RuleGroupItem {
  return {
    id: row.id,
    groupId: row.group_id,
    type: row.type,
    value: row.value,
    isExclusion: parseBoolInt(row.is_exclusion),
    createdAt: row.created_at,
  };
}

// ============================================
// Rules CRUD
// ============================================

const LIST_ENABLED_RULES = `
  SELECT * FROM rules WHERE enabled = TRUE ORDER BY sort_order, id
`;

const LIST_ALL_RULES = `
  SELECT * FROM rules ORDER BY sort_order, id
`;

const GET_RULE = `
  SELECT * FROM rules WHERE id = $1
`;

const GET_ACTIONS_FOR_RULE = `
  SELECT * FROM rule_actions WHERE rule_id = $1 ORDER BY sort_order, id
`;

const GET_ACTIONS_FOR_RULES = `
  SELECT * FROM rule_actions WHERE rule_id = ANY($1) ORDER BY rule_id, sort_order, id
`;

export async function listEnabledRules(): Promise<Rule[]> {
  const rows = await db.query<RuleRow>(LIST_ENABLED_RULES).all();
  return rows.map(parseRuleRow);
}

export async function listAllRules(): Promise<Rule[]> {
  const rows = await db.query<RuleRow>(LIST_ALL_RULES).all();
  return rows.map(parseRuleRow);
}

export async function getRule(id: number): Promise<Rule | null> {
  const row = await db.query<RuleRow>(GET_RULE).get(id);
  return row ? parseRuleRow(row) : null;
}

export async function getRuleWithActions(
  id: number
): Promise<RuleWithActions | null> {
  const rule = await getRule(id);
  if (!rule) {
    return null;
  }
  const actionRows = await db
    .query<RuleActionRow>(GET_ACTIONS_FOR_RULE)
    .all(id);
  return { ...rule, actions: actionRows.map(parseActionRow) };
}

export async function listEnabledRulesWithActions(): Promise<
  RuleWithActions[]
> {
  const rules = await listEnabledRules();
  if (rules.length === 0) {
    return [];
  }

  const ruleIds = rules.map((r) => r.id);
  const actionRows = await db
    .query<RuleActionRow>(GET_ACTIONS_FOR_RULES)
    .all(ruleIds);
  const actions = actionRows.map(parseActionRow);

  const actionsByRule = new Map<number, RuleAction[]>();
  for (const action of actions) {
    const list = actionsByRule.get(action.ruleId) ?? [];
    list.push(action);
    actionsByRule.set(action.ruleId, list);
  }

  return rules.map((rule) => ({
    ...rule,
    actions: actionsByRule.get(rule.id) ?? [],
  }));
}

export interface CreateRuleInput {
  conditionBody?: string | null;
  conditionClassification?: string[];
  conditionFrom?: string | null;
  conditionOperator?: RuleConditionOperator;
  conditionSubject?: string | null;
  conditionTo?: string | null;
  enabled?: boolean;
  groupId?: number | null;
  instructions?: string | null;
  name: string;
  runOnThreads?: boolean;
  sortOrder?: number;
  systemType?: string | null;
}

export async function createRule(input: CreateRuleInput): Promise<Rule> {
  const rows = await db.run(
    `INSERT INTO rules (name, instructions, condition_from, condition_to, condition_subject, condition_body,
      condition_operator, condition_classification, run_on_threads, enabled, sort_order, group_id, system_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      input.name,
      input.instructions ?? null,
      input.conditionFrom ?? null,
      input.conditionTo ?? null,
      input.conditionSubject ?? null,
      input.conditionBody ?? null,
      input.conditionOperator ?? "AND",
      input.conditionClassification ?? [],
      input.runOnThreads ?? true,
      input.enabled ?? true,
      input.sortOrder ?? 0,
      input.groupId ?? null,
      input.systemType ?? null,
    ]
  );
  return parseRuleRow(rows[0] as RuleRow);
}

export async function updateRule(
  id: number,
  input: Partial<CreateRuleInput>
): Promise<Rule | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const fields: [string, unknown][] = [
    ["name", input.name],
    ["instructions", input.instructions],
    ["condition_from", input.conditionFrom],
    ["condition_to", input.conditionTo],
    ["condition_subject", input.conditionSubject],
    ["condition_body", input.conditionBody],
    ["condition_operator", input.conditionOperator],
    ["condition_classification", input.conditionClassification],
    ["run_on_threads", input.runOnThreads],
    ["enabled", input.enabled],
    ["sort_order", input.sortOrder],
    ["group_id", input.groupId],
    ["system_type", input.systemType],
  ];

  for (const [col, val] of fields) {
    if (val !== undefined) {
      sets.push(`${col} = $${idx}`);
      params.push(val);
      idx++;
    }
  }

  if (sets.length === 0) {
    return getRule(id);
  }

  sets.push("updated_at = now()");
  params.push(id);

  const rows = await db.run(
    `UPDATE rules SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );

  if (!rows[0]) {
    return null;
  }
  return parseRuleRow(rows[0] as RuleRow);
}

export async function deleteRule(id: number): Promise<boolean> {
  const rows = await db.run("DELETE FROM rules WHERE id = $1 RETURNING id", [
    id,
  ]);
  return rows.length > 0;
}

// ============================================
// Rule Actions CRUD
// ============================================

export interface CreateActionInput {
  contentTemplate?: string | null;
  delayMinutes?: number;
  jobType?: string | null;
  label?: string | null;
  ruleId: number;
  sortOrder?: number;
  subjectTemplate?: string | null;
  toAddress?: string | null;
  type: RuleActionType;
  webhookUrl?: string | null;
}

export async function createAction(
  input: CreateActionInput
): Promise<RuleAction> {
  const rows = await db.run(
    `INSERT INTO rule_actions (rule_id, type, label, to_address, subject_template, content_template,
      webhook_url, job_type, delay_minutes, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      input.ruleId,
      input.type,
      input.label ?? null,
      input.toAddress ?? null,
      input.subjectTemplate ?? null,
      input.contentTemplate ?? null,
      input.webhookUrl ?? null,
      input.jobType ?? null,
      input.delayMinutes ?? 0,
      input.sortOrder ?? 0,
    ]
  );
  return parseActionRow(rows[0] as RuleActionRow);
}

export async function deleteAction(id: number): Promise<boolean> {
  const rows = await db.run(
    "DELETE FROM rule_actions WHERE id = $1 RETURNING id",
    [id]
  );
  return rows.length > 0;
}

export async function deleteActionsForRule(ruleId: number): Promise<number> {
  const rows = await db.run(
    "DELETE FROM rule_actions WHERE rule_id = $1 RETURNING id",
    [ruleId]
  );
  return rows.length;
}

// ============================================
// Rule Groups CRUD
// ============================================

export async function createGroup(
  name: string,
  ruleId?: number
): Promise<RuleGroup> {
  const rows = await db.run(
    "INSERT INTO rule_groups (name, rule_id) VALUES ($1, $2) RETURNING *",
    [name, ruleId ?? null]
  );
  return parseGroupRow(rows[0] as RuleGroupRow);
}

export async function getGroupWithItems(
  groupId: number
): Promise<RuleGroupWithItems | null> {
  const groupRow = await db
    .query<RuleGroupRow>("SELECT * FROM rule_groups WHERE id = $1")
    .get(groupId);
  if (!groupRow) {
    return null;
  }

  const itemRows = await db
    .query<RuleGroupItemRow>(
      "SELECT * FROM rule_group_items WHERE group_id = $1 ORDER BY created_at"
    )
    .all(groupId);

  return {
    ...parseGroupRow(groupRow),
    items: itemRows.map(parseGroupItemRow),
  };
}

export async function listGroupsWithItems(): Promise<RuleGroupWithItems[]> {
  const groupRows = await db
    .query<RuleGroupRow>("SELECT * FROM rule_groups ORDER BY id")
    .all();
  if (groupRows.length === 0) {
    return [];
  }

  const groupIds = groupRows.map((row) => row.id);
  const itemRows = await db
    .query<RuleGroupItemRow>(
      "SELECT * FROM rule_group_items WHERE group_id = ANY($1) ORDER BY group_id, created_at"
    )
    .all(groupIds);
  const items = itemRows.map(parseGroupItemRow);

  const itemsByGroup = new Map<number, RuleGroupItem[]>();
  for (const item of items) {
    const list = itemsByGroup.get(item.groupId) ?? [];
    list.push(item);
    itemsByGroup.set(item.groupId, list);
  }

  return groupRows.map((row) => {
    const group = parseGroupRow(row);
    return { ...group, items: itemsByGroup.get(group.id) ?? [] };
  });
}

export async function addGroupItem(
  groupId: number,
  type: "from" | "subject" | "domain",
  value: string,
  isExclusion = false
): Promise<RuleGroupItem> {
  const rows = await db.run(
    `INSERT INTO rule_group_items (group_id, type, value, is_exclusion)
    VALUES ($1, $2, $3, $4) RETURNING *`,
    [groupId, type, value, isExclusion]
  );
  return parseGroupItemRow(rows[0] as RuleGroupItemRow);
}

export async function deleteGroupItem(id: number): Promise<boolean> {
  const rows = await db.run(
    "DELETE FROM rule_group_items WHERE id = $1 RETURNING id",
    [id]
  );
  return rows.length > 0;
}
