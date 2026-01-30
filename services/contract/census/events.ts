import type {
  Action,
  ActionInsert,
  ActionStatus,
  Event,
  EventInsert,
  EventType,
  Permit,
  PermitInsert,
  SpawnActionsResult,
  Stakeholder,
  StakeholderInsert,
  Workflow,
} from "./event-types";

// =============================================================================
// STAKEHOLDER FUNCTIONS
// =============================================================================

/**
 * Get all stakeholders for a project
 */
export function getStakeholders(projectId: number): Stakeholder[] {
  const db = db;
  const rows = db
    .query(
      `
    SELECT * FROM stakeholders
    WHERE project_id = ?
    ORDER BY is_primary DESC, role, name
  `
    )
    .all(projectId) as Stakeholder[];

  return rows.map((row) => ({
    ...row,
    is_primary: Boolean(row.is_primary),
    is_internal: Boolean(row.is_internal),
    notify_on: row.notify_on
      ? JSON.parse(row.notify_on as unknown as string)
      : [],
  }));
}

/**
 * Get stakeholders who should be notified for a specific event type
 */
export function getStakeholdersForEvent(
  projectId: number,
  eventType: EventType
): Stakeholder[] {
  const stakeholders = getStakeholders(projectId);
  return stakeholders.filter(
    (s) => s.notify_on.includes(eventType) || s.notify_on.includes("*")
  );
}

/**
 * Get internal stakeholders (Desert Services team)
 */
export function getInternalStakeholders(role?: string): Stakeholder[] {
  const db = db;
  let query = "SELECT * FROM stakeholders WHERE is_internal = 1";
  const params: (string | number)[] = [];

  if (role) {
    query += " AND role = ?";
    params.push(role);
  }

  const rows = db.query(query).all(...params) as Stakeholder[];
  return rows.map((row) => ({
    ...row,
    is_primary: Boolean(row.is_primary),
    is_internal: Boolean(row.is_internal),
    notify_on: row.notify_on
      ? JSON.parse(row.notify_on as unknown as string)
      : [],
  }));
}

/**
 * Add a stakeholder to a project
 */
export function addStakeholder(data: StakeholderInsert): number {
  const db = db;
  const result = db
    .query(
      `
    INSERT INTO stakeholders (
      project_id, account_id, name, email, phone, role,
      is_primary, is_internal, notify_on, source, source_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      data.project_id,
      data.account_id,
      data.name,
      data.email,
      data.phone,
      data.role,
      data.is_primary ? 1 : 0,
      data.is_internal ? 1 : 0,
      data.notify_on ? JSON.stringify(data.notify_on) : null,
      data.source,
      data.source_id,
      data.notes
    );

  return Number(result.lastInsertRowid);
}

/**
 * Add multiple stakeholders to a project
 */
export function addStakeholders(
  projectId: number,
  stakeholders: Omit<StakeholderInsert, "project_id">[]
): number[] {
  const ids: number[] = [];
  for (const s of stakeholders) {
    const id = addStakeholder({ ...s, project_id: projectId });
    ids.push(id);
  }
  return ids;
}

// =============================================================================
// PERMIT FUNCTIONS
// =============================================================================

/**
 * Get a permit by application number
 */
export function getPermitByAppNumber(applicationNumber: string): Permit | null {
  const db = db;
  const row = db
    .query("SELECT * FROM permits WHERE application_number = ?")
    .get(applicationNumber) as Permit | null;

  return row;
}

/**
 * Get permits for a project
 */
export function getPermitsForProject(projectId: number): Permit[] {
  const db = db;
  const rows = db
    .query(
      `
    SELECT * FROM permits
    WHERE project_id = ?
    ORDER BY submitted_at DESC
  `
    )
    .all(projectId) as Permit[];

  return rows;
}

/**
 * Create a new permit record
 */
export function createPermit(data: PermitInsert): number {
  const db = db;
  const result = db
    .query(
      `
    INSERT INTO permits (
      application_number, permit_number, project_id, account_id,
      permit_type, status, project_name, company_name,
      acreage, fee, site_address, parcel_number,
      submitted_at, paid_at, issued_at, expires_at, closed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      data.application_number,
      data.permit_number,
      data.project_id,
      data.account_id,
      data.permit_type,
      data.status,
      data.project_name,
      data.company_name,
      data.acreage,
      data.fee,
      data.site_address,
      data.parcel_number,
      data.submitted_at,
      data.paid_at,
      data.issued_at,
      data.expires_at,
      data.closed_at
    );

  return Number(result.lastInsertRowid);
}

/**
 * Update permit notification timestamps
 */
export function markPermitNotified(
  permitId: number,
  type: "customer" | "internal"
): void {
  const db = db;
  const column =
    type === "customer" ? "customer_notified_at" : "internal_notified_at";
  db.query(`UPDATE permits SET ${column} = datetime('now') WHERE id = ?`).run(
    permitId
  );
}

// =============================================================================
// EVENT FUNCTIONS
// =============================================================================

/**
 * Log an event
 */
export function logEvent(data: EventInsert): number {
  const db = db;
  const result = db
    .query(
      `
    INSERT INTO events (
      project_id, permit_id, event_type, event_data, source, source_id, actor
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      data.project_id,
      data.permit_id,
      data.event_type,
      data.event_data ? JSON.stringify(data.event_data) : null,
      data.source,
      data.source_id,
      data.actor
    );

  return Number(result.lastInsertRowid);
}

/**
 * Get recent events for a project
 */
export function getEventsForProject(projectId: number, limit = 50): Event[] {
  const db = db;
  const rows = db
    .query(
      `
    SELECT * FROM events
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(projectId, limit) as Event[];

  return rows.map((row) => ({
    ...row,
    event_data: row.event_data
      ? JSON.parse(row.event_data as unknown as string)
      : null,
  }));
}

/**
 * Get an event by ID
 */
export function getEvent(eventId: number): Event | null {
  const db = db;
  const row = db
    .query("SELECT * FROM events WHERE id = ?")
    .get(eventId) as Event | null;

  if (!row) {
    return null;
  }

  return {
    ...row,
    event_data: row.event_data
      ? JSON.parse(row.event_data as unknown as string)
      : null,
  };
}

// =============================================================================
// ACTION FUNCTIONS
// =============================================================================

/**
 * Get workflows for an event type
 */
export function getWorkflowsForEvent(eventType: EventType): Workflow[] {
  const db = db;
  const rows = db
    .query(
      `
    SELECT * FROM workflows
    WHERE event_type = ? AND is_active = 1
    ORDER BY priority
  `
    )
    .all(eventType) as Workflow[];

  return rows.map((row) => ({
    ...row,
    is_active: Boolean(row.is_active),
    action_config: row.action_config
      ? JSON.parse(row.action_config as unknown as string)
      : null,
    conditions: row.conditions
      ? JSON.parse(row.conditions as unknown as string)
      : null,
  }));
}

/**
 * Spawn actions for an event based on active workflows
 */
export function spawnActionsForEvent(eventId: number): SpawnActionsResult {
  const db = db;
  const event = getEvent(eventId);

  if (!event) {
    throw new Error(`Event ${eventId} not found`);
  }

  const workflows = getWorkflowsForEvent(event.event_type);
  const actionIds: number[] = [];

  for (const workflow of workflows) {
    const result = db
      .query(
        `
      INSERT INTO actions (
        event_id, project_id, permit_id, action_type, action_config, status, priority
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `
      )
      .run(
        eventId,
        event.project_id,
        event.permit_id,
        workflow.action_type,
        workflow.action_config ? JSON.stringify(workflow.action_config) : null,
        workflow.priority
      );

    actionIds.push(Number(result.lastInsertRowid));
  }

  return {
    event_id: eventId,
    actions_created: actionIds.length,
    action_ids: actionIds,
  };
}

/**
 * Get pending actions for a project
 */
export function getPendingActions(projectId?: number): Action[] {
  const db = db;
  let query = "SELECT * FROM actions WHERE status = 'pending'";
  const params: (string | number)[] = [];

  if (projectId) {
    query += " AND project_id = ?";
    params.push(projectId);
  }

  query += " ORDER BY priority, created_at";

  const rows = db.query(query).all(...params) as Action[];

  return rows.map((row) => ({
    ...row,
    action_config: row.action_config
      ? JSON.parse(row.action_config as unknown as string)
      : null,
    result: row.result ? JSON.parse(row.result as unknown as string) : null,
  }));
}

/**
 * Get an action by ID
 */
export function getAction(actionId: number): Action | null {
  const db = db;
  const row = db
    .query("SELECT * FROM actions WHERE id = ?")
    .get(actionId) as Action | null;

  if (!row) {
    return null;
  }

  return {
    ...row,
    action_config: row.action_config
      ? JSON.parse(row.action_config as unknown as string)
      : null,
    result: row.result ? JSON.parse(row.result as unknown as string) : null,
  };
}

/**
 * Update action status
 */
export function updateActionStatus(
  actionId: number,
  status: ActionStatus,
  result?: Record<string, unknown>,
  error?: string
): void {
  const db = db;

  if (status === "running") {
    db.query(
      `
      UPDATE actions
      SET status = 'running', started_at = datetime('now'), attempt_count = attempt_count + 1
      WHERE id = ?
    `
    ).run(actionId);
  } else if (status === "complete") {
    db.query(
      `
      UPDATE actions
      SET status = 'complete', completed_at = datetime('now'), result = ?
      WHERE id = ?
    `
    ).run(result ? JSON.stringify(result) : null, actionId);
  } else if (status === "failed") {
    db.query(
      `
      UPDATE actions
      SET status = 'failed', last_error = ?
      WHERE id = ?
    `
    ).run(error ?? null, actionId);
  } else {
    db.query("UPDATE actions SET status = ? WHERE id = ?").run(
      status,
      actionId
    );
  }
}

/**
 * Create an action manually (not from workflow)
 */
export function createAction(data: ActionInsert): number {
  const db = db;
  const result = db
    .query(
      `
    INSERT INTO actions (
      event_id, project_id, permit_id, action_type, action_config, status, priority
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      data.event_id,
      data.project_id,
      data.permit_id,
      data.action_type,
      data.action_config ? JSON.stringify(data.action_config) : null,
      data.status ?? "pending",
      data.priority ?? 100
    );

  return Number(result.lastInsertRowid);
}

// =============================================================================
// HIGH-LEVEL ORCHESTRATION
// =============================================================================

/**
 * Full flow: Log event and spawn actions
 *
 * This is the main entry point for triggering workflows.
 */
export function triggerEvent(data: EventInsert): {
  event_id: number;
  actions: SpawnActionsResult;
} {
  const eventId = logEvent(data);
  const actions = spawnActionsForEvent(eventId);

  return {
    event_id: eventId,
    actions,
  };
}

/**
 * Find or create a project by name matching
 * Returns project_id
 */
export function findOrCreateProject(name: string, accountId?: number): number {
  const db = db;
  const normalized = name.toLowerCase().trim();

  // Try exact match first
  let project = db
    .query("SELECT id FROM projects WHERE normalized_name = ?")
    .get(normalized) as { id: number } | null;

  if (project) {
    return project.id;
  }

  // Try fuzzy match
  project = db
    .query("SELECT id FROM projects WHERE normalized_name LIKE ?")
    .get(`%${normalized}%`) as { id: number } | null;

  if (project) {
    return project.id;
  }

  // Create new project
  const result = db
    .query(
      `
    INSERT INTO projects (name, normalized_name, account_id)
    VALUES (?, ?, ?)
  `
    )
    .run(name, normalized, accountId ?? null);

  return Number(result.lastInsertRowid);
}

// =============================================================================
// MIGRATION HELPER
// =============================================================================

/**
 * Run the event system migration
 */
export async function runMigration(): Promise<void> {
  const migrationPath =
    "services/contract/census/migrations/001-event-system.sql";
  const sql = await Bun.file(migrationPath).text();

  const db = db;

  // Split by semicolon and run each statement
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    try {
      db.run(statement);
    } catch (error) {
      // Ignore "table already exists" errors
      const msg = (error as Error).message;
      if (!msg.includes("already exists")) {
        console.error(`Error running statement: ${statement.slice(0, 50)}...`);
        throw error;
      }
    }
  }

  console.log("Migration complete: 001-event-system");
}
