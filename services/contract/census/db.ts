/**
 * Email Census Database
 *
 * SQLite database for storing email metadata, classifications, and extracted tasks.
 * Provides visibility into company email across all key mailboxes.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Initialize SQLite database
const defaultPath = join(import.meta.dir, "census.db");
const dbPath = process.env.CENSUS_DATABASE_PATH ?? defaultPath;

// Ensure the directory exists
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath, { create: true });

// Enable WAL mode for better performance
db.run("PRAGMA journal_mode = WAL");

// Enable foreign key constraints
db.run("PRAGMA foreign_keys = ON");

// Wait up to 30s for locks (handles concurrent access better)
db.run("PRAGMA busy_timeout = 30000");

// ============================================
// Schema: Mailboxes
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS mailboxes (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    last_sync_at TEXT,
    email_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Schema: Emails
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY,
    message_id TEXT UNIQUE NOT NULL,
    mailbox_id INTEGER NOT NULL,
    conversation_id TEXT,
    subject TEXT,
    from_email TEXT,
    from_name TEXT,
    to_emails TEXT,
    cc_emails TEXT,
    received_at TEXT NOT NULL,
    has_attachments INTEGER DEFAULT 0,
    attachment_names TEXT,
    body_preview TEXT,
    web_url TEXT,

    -- Classification
    classification TEXT,
    classification_confidence REAL,
    classification_method TEXT,

    -- Linking
    project_name TEXT,
    contractor_name TEXT,
    monday_estimate_id TEXT,
    notion_project_id TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id)
  )
`);

// ============================================
// Schema: Email Tasks
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS email_tasks (
    id INTEGER PRIMARY KEY,
    email_id INTEGER NOT NULL,
    task_description TEXT NOT NULL,
    task_type TEXT,
    priority TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (email_id) REFERENCES emails(id)
  )
`);

// ============================================
// Schema: Email Entities
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS email_entities (
    id INTEGER PRIMARY KEY,
    email_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_value TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (email_id) REFERENCES emails(id)
  )
`);

// ============================================
// Schema: Accounts (Contractors/GCs)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'contractor',  -- 'contractor', 'platform', 'internal'
    contact_count INTEGER DEFAULT 0,
    email_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Schema: Projects
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    account_id INTEGER,
    name TEXT NOT NULL,
    normalized_name TEXT,  -- for matching: lowercase, stripped
    address TEXT,
    email_count INTEGER DEFAULT 0,
    first_seen TEXT,
    last_seen TEXT,
    monday_item_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  )
`);

// Add account_id and project_id to emails if not exists
try {
  db.run(
    "ALTER TABLE emails ADD COLUMN account_id INTEGER REFERENCES accounts(id)"
  );
} catch {
  /* column already exists */
}

try {
  db.run(
    "ALTER TABLE emails ADD COLUMN project_id INTEGER REFERENCES projects(id)"
  );
} catch {
  /* column already exists */
}

// Add body_full column for complete email body text
try {
  db.run("ALTER TABLE emails ADD COLUMN body_full TEXT");
} catch {
  /* column already exists */
}

// Add body_html column for original HTML (preserves links)
try {
  db.run("ALTER TABLE emails ADD COLUMN body_html TEXT");
} catch {
  /* column already exists */
}

// Add domain extraction columns
try {
  db.run("ALTER TABLE emails ADD COLUMN from_domain TEXT");
} catch {
  /* column already exists */
}

try {
  db.run("ALTER TABLE emails ADD COLUMN is_internal INTEGER DEFAULT 0");
} catch {
  /* column already exists */
}

try {
  db.run("ALTER TABLE emails ADD COLUMN is_forwarded INTEGER DEFAULT 0");
} catch {
  /* column already exists */
}

try {
  db.run("ALTER TABLE emails ADD COLUMN original_sender_email TEXT");
} catch {
  /* column already exists */
}

try {
  db.run("ALTER TABLE emails ADD COLUMN original_sender_domain TEXT");
} catch {
  /* column already exists */
}

try {
  db.run("ALTER TABLE emails ADD COLUMN categories TEXT");
} catch {
  /* column already exists */
}

// ============================================
// Schema: Attachments
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY,
    email_id INTEGER NOT NULL,
    attachment_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,

    -- MinIO storage
    storage_bucket TEXT,
    storage_path TEXT,

    -- OCR/Text extraction
    extracted_text TEXT,
    extraction_status TEXT DEFAULT 'pending',
    extraction_error TEXT,
    extracted_at TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (email_id) REFERENCES emails(id),
    UNIQUE(email_id, attachment_id)
  )
`);

// Add storage columns to attachments if not exists (for existing DBs)
try {
  db.run("ALTER TABLE attachments ADD COLUMN storage_bucket TEXT");
} catch {
  /* column already exists */
}
try {
  db.run("ALTER TABLE attachments ADD COLUMN storage_path TEXT");
} catch {
  /* column already exists */
}

// ============================================
// Indexes
// ============================================
db.run("CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(mailbox_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at)");
db.run(
  "CREATE INDEX IF NOT EXISTS idx_emails_classification ON emails(classification)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_emails_conversation ON emails(conversation_id)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_email_tasks_email ON email_tasks(email_id)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_email_entities_email ON email_entities(email_id)"
);
db.run("CREATE INDEX IF NOT EXISTS idx_accounts_domain ON accounts(domain)");
db.run("CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type)");
db.run(
  "CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id)"
);
db.run("CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_emails_project ON emails(project_id)");
db.run(
  "CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments(email_id)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_attachments_status ON attachments(extraction_status)"
);

// ============================================
// Types
// ============================================

export type EmailClassification =
  | "CONTRACT"
  | "DUST_PERMIT"
  | "SWPPP"
  | "ESTIMATE"
  | "INSURANCE"
  | "INVOICE"
  | "SCHEDULE"
  | "CHANGE_ORDER"
  | "INTERNAL"
  | "VENDOR"
  | "SPAM"
  | "UNKNOWN";

export type TaskType = "action_required" | "fyi" | "follow_up" | "waiting_on";

export type TaskPriority = "urgent" | "normal" | "low";

export type ClassificationMethod = "pattern" | "llm";

export type AccountType = "contractor" | "platform" | "internal";

export interface Account {
  id: number;
  domain: string;
  name: string;
  type: AccountType;
  contactCount: number;
  emailCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  accountId: number | null;
  name: string;
  normalizedName: string | null;
  address: string | null;
  emailCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  mondayItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Mailbox {
  id: number;
  email: string;
  displayName: string | null;
  lastSyncAt: string | null;
  emailCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Email {
  id: number;
  messageId: string;
  mailboxId: number;
  conversationId: string | null;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  receivedAt: string;
  hasAttachments: boolean;
  attachmentNames: string[];
  bodyPreview: string | null;
  webUrl: string | null;
  classification: EmailClassification | null;
  classificationConfidence: number | null;
  classificationMethod: ClassificationMethod | null;
  projectName: string | null;
  contractorName: string | null;
  mondayEstimateId: string | null;
  notionProjectId: string | null;
  accountId: number | null;
  projectId: number | null;
  bodyFull: string | null;
  bodyHtml: string | null;
  categories: string[];
  createdAt: string;
}

export type ExtractionStatus = "pending" | "success" | "failed" | "skipped";

export interface Attachment {
  id: number;
  emailId: number;
  attachmentId: string;
  name: string;
  contentType: string | null;
  size: number | null;
  storageBucket: string | null;
  storagePath: string | null;
  extractedText: string | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  extractedAt: string | null;
  createdAt: string;
}

export interface EmailTask {
  id: number;
  emailId: number;
  taskDescription: string;
  taskType: TaskType | null;
  priority: TaskPriority | null;
  dueDate: string | null;
  status: string;
  createdAt: string;
}

export interface EmailEntity {
  id: number;
  emailId: number;
  entityType: string;
  entityValue: string;
  createdAt: string;
}

// ============================================
// Mailbox Helpers
// ============================================

export function getMailbox(email: string): Mailbox | null {
  const row = db
    .query<
      {
        id: number;
        email: string;
        display_name: string | null;
        last_sync_at: string | null;
        email_count: number;
        created_at: string;
        updated_at: string;
      },
      [string]
    >("SELECT * FROM mailboxes WHERE email = ?")
    .get(email);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    lastSyncAt: row.last_sync_at,
    emailCount: row.email_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getOrCreateMailbox(
  email: string,
  displayName?: string
): Mailbox {
  const existing = getMailbox(email);
  if (existing) {
    return existing;
  }

  db.run("INSERT INTO mailboxes (email, display_name) VALUES (?, ?)", [
    email,
    displayName ?? null,
  ]);

  const created = getMailbox(email);
  if (!created) {
    throw new Error(`Failed to create mailbox for ${email}`);
  }
  return created;
}

export function updateMailboxSyncState(
  mailboxId: number,
  emailCount: number
): void {
  db.run(
    `UPDATE mailboxes
     SET last_sync_at = datetime('now'),
         email_count = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [emailCount, mailboxId]
  );
}

export function getAllMailboxes(): Mailbox[] {
  const rows = db
    .query<
      {
        id: number;
        email: string;
        display_name: string | null;
        last_sync_at: string | null;
        email_count: number;
        created_at: string;
        updated_at: string;
      },
      []
    >("SELECT * FROM mailboxes ORDER BY email")
    .all();

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    lastSyncAt: row.last_sync_at,
    emailCount: row.email_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ============================================
// Email Helpers
// ============================================

export interface InsertEmailData {
  messageId: string;
  mailboxId: number;
  conversationId?: string | null;
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  toEmails?: string[];
  ccEmails?: string[];
  receivedAt: string;
  hasAttachments?: boolean;
  attachmentNames?: string[];
  bodyPreview?: string | null;
  bodyFull?: string | null;
  bodyHtml?: string | null;
  webUrl?: string | null;
  categories?: string[];
}

/**
 * Normalize email subject by stripping reply/forward/reminder prefixes.
 * Internal version that handles null for insertEmail.
 */
function normalizeSubjectInternal(subject: string | null): string | null {
  if (!subject) {
    return null;
  }
  return subject
    .replace(/^(FW|Fw|fw|RE|Re|re|Fwd|FWD|fwd):\s*/g, "")
    .replace(/^Reminder:\s*/gi, "")
    .replace(/^Completed:\s*/gi, "")
    .replace(/^READY TO BE SIGNED -\s*/gi, "")
    .replace(/^READY TO SIGN:\s*/gi, "")
    .trim();
}

export function insertEmail(data: InsertEmailData): number {
  const normalized = normalizeSubjectInternal(data.subject ?? null);

  db.run(
    `INSERT INTO emails (
      message_id, mailbox_id, conversation_id, subject, normalized_subject, from_email, from_name,
      to_emails, cc_emails, received_at, has_attachments, attachment_names,
      body_preview, body_full, body_html, web_url, categories
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      subject = excluded.subject,
      normalized_subject = excluded.normalized_subject,
      from_email = excluded.from_email,
      from_name = excluded.from_name,
      to_emails = excluded.to_emails,
      cc_emails = excluded.cc_emails,
      has_attachments = excluded.has_attachments,
      attachment_names = excluded.attachment_names,
      body_preview = excluded.body_preview,
      body_full = excluded.body_full,
      body_html = excluded.body_html,
      categories = excluded.categories`,
    [
      data.messageId,
      data.mailboxId,
      data.conversationId ?? null,
      data.subject ?? null,
      normalized,
      data.fromEmail ?? null,
      data.fromName ?? null,
      JSON.stringify(data.toEmails ?? []),
      JSON.stringify(data.ccEmails ?? []),
      data.receivedAt,
      data.hasAttachments ? 1 : 0,
      JSON.stringify(data.attachmentNames ?? []),
      data.bodyPreview ?? null,
      data.bodyFull ?? null,
      data.bodyHtml ?? null,
      data.webUrl ?? null,
      JSON.stringify(data.categories ?? []),
    ]
  );

  // Query for actual id (handles both insert and update cases)
  const row = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM emails WHERE message_id = ?"
    )
    .get(data.messageId);

  return row?.id ?? 0;
}

export function getEmailByMessageId(messageId: string): Email | null {
  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM emails WHERE message_id = ?"
    )
    .get(messageId);

  if (!row) {
    return null;
  }

  return parseEmailRow(row);
}

export function getEmailById(id: number): Email | null {
  const row = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails WHERE id = ?"
    )
    .get(id);

  if (!row) {
    return null;
  }

  return parseEmailRow(row);
}

function parseEmailRow(row: Record<string, unknown>): Email {
  return {
    id: row.id as number,
    messageId: row.message_id as string,
    mailboxId: row.mailbox_id as number,
    conversationId: row.conversation_id as string | null,
    subject: row.subject as string | null,
    fromEmail: row.from_email as string | null,
    fromName: row.from_name as string | null,
    toEmails: JSON.parse((row.to_emails as string) || "[]"),
    ccEmails: JSON.parse((row.cc_emails as string) || "[]"),
    receivedAt: row.received_at as string,
    hasAttachments: row.has_attachments === 1,
    attachmentNames: JSON.parse((row.attachment_names as string) || "[]"),
    bodyPreview: row.body_preview as string | null,
    webUrl: row.web_url as string | null,
    classification: row.classification as EmailClassification | null,
    classificationConfidence: row.classification_confidence as number | null,
    classificationMethod:
      row.classification_method as ClassificationMethod | null,
    projectName: row.project_name as string | null,
    contractorName: row.contractor_name as string | null,
    mondayEstimateId: row.monday_estimate_id as string | null,
    notionProjectId: row.notion_project_id as string | null,
    accountId: row.account_id as number | null,
    projectId: row.project_id as number | null,
    bodyFull: row.body_full as string | null,
    bodyHtml: row.body_html as string | null,
    categories: JSON.parse((row.categories as string) || "[]"),
    createdAt: row.created_at as string,
  };
}

export function updateEmailClassification(
  emailId: number,
  classification: EmailClassification,
  confidence: number,
  method: ClassificationMethod
): void {
  db.run(
    `UPDATE emails
     SET classification = ?, classification_confidence = ?, classification_method = ?
     WHERE id = ?`,
    [classification, confidence, method, emailId]
  );
}

export function updateEmailProjectLink(
  emailId: number,
  data: {
    projectName?: string | null;
    contractorName?: string | null;
    mondayEstimateId?: string | null;
    notionProjectId?: string | null;
  }
): void {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.projectName !== undefined) {
    updates.push("project_name = ?");
    values.push(data.projectName);
  }
  if (data.contractorName !== undefined) {
    updates.push("contractor_name = ?");
    values.push(data.contractorName);
  }
  if (data.mondayEstimateId !== undefined) {
    updates.push("monday_estimate_id = ?");
    values.push(data.mondayEstimateId);
  }
  if (data.notionProjectId !== undefined) {
    updates.push("notion_project_id = ?");
    values.push(data.notionProjectId);
  }

  if (updates.length === 0) {
    return;
  }

  values.push(emailId);
  db.run(`UPDATE emails SET ${updates.join(", ")} WHERE id = ?`, values);
}

export function getUnclassifiedEmails(limit = 1000): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM emails
       WHERE classification IS NULL
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(limit);

  return rows.map(parseEmailRow);
}

export function getEmailsByClassification(
  classification: EmailClassification,
  limit = 100
): Email[] {
  const rows = db
    .query<Record<string, unknown>, [string, number]>(
      `SELECT * FROM emails
       WHERE classification = ?
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(classification, limit);

  return rows.map(parseEmailRow);
}

export function getEmailsWithoutProjectLink(
  classifications: EmailClassification[],
  limit = 1000
): Email[] {
  const placeholders = classifications.map(() => "?").join(", ");
  const rows = db
    .query<Record<string, unknown>, (string | number)[]>(
      `SELECT * FROM emails
       WHERE classification IN (${placeholders})
       AND monday_estimate_id IS NULL
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(...classifications, limit);

  return rows.map(parseEmailRow);
}

// ============================================
// Task Helpers
// ============================================

export interface InsertTaskData {
  emailId: number;
  taskDescription: string;
  taskType?: TaskType | null;
  priority?: TaskPriority | null;
  dueDate?: string | null;
}

export function insertTask(data: InsertTaskData): number {
  const result = db.run(
    `INSERT INTO email_tasks (email_id, task_description, task_type, priority, due_date)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.emailId,
      data.taskDescription,
      data.taskType ?? null,
      data.priority ?? null,
      data.dueDate ?? null,
    ]
  );

  return Number(result.lastInsertRowid);
}

export function getTasksForEmail(emailId: number): EmailTask[] {
  const rows = db
    .query<
      {
        id: number;
        email_id: number;
        task_description: string;
        task_type: string | null;
        priority: string | null;
        due_date: string | null;
        status: string;
        created_at: string;
      },
      [number]
    >("SELECT * FROM email_tasks WHERE email_id = ?")
    .all(emailId);

  return rows.map((row) => ({
    id: row.id,
    emailId: row.email_id,
    taskDescription: row.task_description,
    taskType: row.task_type as TaskType | null,
    priority: row.priority as TaskPriority | null,
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export function updateTaskStatus(taskId: number, status: string): void {
  db.run("UPDATE email_tasks SET status = ? WHERE id = ?", [status, taskId]);
}

export function getEmailsWithoutTasks(
  classifications: EmailClassification[],
  limit = 1000
): Email[] {
  const placeholders = classifications.map(() => "?").join(", ");
  const rows = db
    .query<Record<string, unknown>, (string | number)[]>(
      `SELECT e.* FROM emails e
       LEFT JOIN email_tasks t ON t.email_id = e.id
       WHERE e.classification IN (${placeholders})
       AND t.id IS NULL
       ORDER BY e.received_at DESC
       LIMIT ?`
    )
    .all(...classifications, limit);

  return rows.map(parseEmailRow);
}

// ============================================
// Entity Helpers
// ============================================

export function insertEntity(
  emailId: number,
  entityType: string,
  entityValue: string
): number {
  const result = db.run(
    `INSERT INTO email_entities (email_id, entity_type, entity_value)
     VALUES (?, ?, ?)`,
    [emailId, entityType, entityValue]
  );

  return Number(result.lastInsertRowid);
}

export function getEntitiesForEmail(emailId: number): EmailEntity[] {
  const rows = db
    .query<
      {
        id: number;
        email_id: number;
        entity_type: string;
        entity_value: string;
        created_at: string;
      },
      [number]
    >("SELECT * FROM email_entities WHERE email_id = ?")
    .all(emailId);

  return rows.map((row) => ({
    id: row.id,
    emailId: row.email_id,
    entityType: row.entity_type,
    entityValue: row.entity_value,
    createdAt: row.created_at,
  }));
}

// ============================================
// Statistics
// ============================================

export interface ClassificationStats {
  classification: EmailClassification | null;
  count: number;
}

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

export function getRecentEmails(limit = 10): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails ORDER BY id DESC LIMIT ?"
    )
    .all(limit);
  return rows.map(parseEmailRow);
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

export function clearTasks(): void {
  db.run("DELETE FROM email_tasks");
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

// ============================================
// Account Functions
// ============================================

function parseAccountRow(row: Record<string, unknown>): Account {
  return {
    id: row.id as number,
    domain: row.domain as string,
    name: row.name as string,
    type: (row.type as AccountType) ?? "contractor",
    contactCount: (row.contact_count as number) ?? 0,
    emailCount: (row.email_count as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createAccount(
  domain: string,
  name: string,
  type: AccountType = "contractor"
): Account {
  db.run(
    `INSERT INTO accounts (domain, name, type) VALUES (?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET name = ?, type = ?, updated_at = datetime('now')`,
    [domain, name, type, name, type]
  );

  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM accounts WHERE domain = ?"
    )
    .get(domain);

  if (!row) {
    throw new Error(`Failed to create/retrieve account for domain: ${domain}`);
  }
  return parseAccountRow(row);
}

export function getAccountByDomain(domain: string): Account | null {
  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM accounts WHERE domain = ?"
    )
    .get(domain);

  return row ? parseAccountRow(row) : null;
}

/**
 * Look up account ID by company alias.
 * Used for platform emails where we have company name but not domain.
 */
export function getAccountIdByAlias(alias: string): number | null {
  const row = db
    .query<{ account_id: number }, [string]>(
      "SELECT account_id FROM company_aliases WHERE alias = ?"
    )
    .get(alias.toLowerCase());

  return row?.account_id ?? null;
}

/**
 * Add a company alias for an account.
 * Aliases are case-insensitive (stored lowercase).
 */
export function addCompanyAlias(accountId: number, alias: string): boolean {
  try {
    db.run(
      "INSERT OR IGNORE INTO company_aliases (account_id, alias) VALUES (?, ?)",
      [accountId, alias.toLowerCase()]
    );
    return true;
  } catch {
    return false;
  }
}

export function getAllAccounts(type?: AccountType): Account[] {
  const query = type
    ? "SELECT * FROM accounts WHERE type = ? ORDER BY email_count DESC"
    : "SELECT * FROM accounts ORDER BY email_count DESC";

  const rows = type
    ? db.query<Record<string, unknown>, [string]>(query).all(type)
    : db.query<Record<string, unknown>, []>(query).all();

  return rows.map(parseAccountRow);
}

export function updateAccountCounts(): void {
  // Update email counts for each account
  db.run(`
    UPDATE accounts SET
      email_count = (
        SELECT COUNT(*) FROM emails WHERE account_id = accounts.id
      ),
      contact_count = (
        SELECT COUNT(DISTINCT from_email) FROM emails WHERE account_id = accounts.id
      ),
      updated_at = datetime('now')
  `);
}

export function linkEmailToAccount(emailId: number, accountId: number): void {
  db.run("UPDATE emails SET account_id = ? WHERE id = ?", [accountId, emailId]);
}

// ============================================
// Project Functions
// ============================================

function parseProjectRow(row: Record<string, unknown>): Project {
  return {
    id: row.id as number,
    accountId: row.account_id as number | null,
    name: row.name as string,
    normalizedName: row.normalized_name as string | null,
    address: row.address as string | null,
    emailCount: (row.email_count as number) ?? 0,
    firstSeen: row.first_seen as string | null,
    lastSeen: row.last_seen as string | null,
    mondayItemId: row.monday_item_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createProject(
  name: string,
  accountId?: number,
  address?: string
): Project {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  db.run(
    `INSERT INTO projects (name, normalized_name, account_id, address)
     VALUES (?, ?, ?, ?)`,
    [name, normalized, accountId ?? null, address ?? null]
  );

  const row = db
    .query<Record<string, unknown>, []>(
      "SELECT * FROM projects WHERE id = last_insert_rowid()"
    )
    .get();

  if (!row) {
    throw new Error(`Failed to create project: ${name}`);
  }
  return parseProjectRow(row);
}

export function getProjectById(id: number): Project | null {
  const row = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM projects WHERE id = ?"
    )
    .get(id);

  return row ? parseProjectRow(row) : null;
}

export function getProjectsForAccount(accountId: number): Project[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM projects WHERE account_id = ? ORDER BY last_seen DESC"
    )
    .all(accountId);

  return rows.map(parseProjectRow);
}

export function getAllProjects(): Project[] {
  const rows = db
    .query<Record<string, unknown>, []>(
      "SELECT * FROM projects ORDER BY last_seen DESC"
    )
    .all();

  return rows.map(parseProjectRow);
}

export function linkEmailToProject(emailId: number, projectId: number): void {
  db.run("UPDATE emails SET project_id = ? WHERE id = ?", [projectId, emailId]);

  // Update project stats
  db.run(
    `
    UPDATE projects SET
      email_count = (SELECT COUNT(*) FROM emails WHERE project_id = projects.id),
      first_seen = (SELECT MIN(received_at) FROM emails WHERE project_id = projects.id),
      last_seen = (SELECT MAX(received_at) FROM emails WHERE project_id = projects.id),
      updated_at = datetime('now')
    WHERE id = ?
  `,
    [projectId]
  );
}

export function getEmailsForProject(projectId: number): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails WHERE project_id = ? ORDER BY received_at ASC"
    )
    .all(projectId);

  return rows.map(parseEmailRow);
}

export function getEmailsForAccount(accountId: number): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails WHERE account_id = ? ORDER BY received_at DESC"
    )
    .all(accountId);

  return rows.map(parseEmailRow);
}

// ============================================
// Attachment Functions
// ============================================

function parseAttachmentRow(row: Record<string, unknown>): Attachment {
  return {
    id: row.id as number,
    emailId: row.email_id as number,
    attachmentId: row.attachment_id as string,
    name: row.name as string,
    contentType: row.content_type as string | null,
    size: row.size as number | null,
    storageBucket: row.storage_bucket as string | null,
    storagePath: row.storage_path as string | null,
    extractedText: row.extracted_text as string | null,
    extractionStatus: (row.extraction_status as ExtractionStatus) ?? "pending",
    extractionError: row.extraction_error as string | null,
    extractedAt: row.extracted_at as string | null,
    createdAt: row.created_at as string,
  };
}

export interface InsertAttachmentData {
  emailId: number;
  attachmentId: string;
  name: string;
  contentType?: string | null;
  size?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
}

export function insertAttachment(data: InsertAttachmentData): number {
  const result = db.run(
    `INSERT INTO attachments (email_id, attachment_id, name, content_type, size, storage_bucket, storage_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email_id, attachment_id) DO UPDATE SET
       name = excluded.name,
       content_type = excluded.content_type,
       size = excluded.size,
       storage_bucket = COALESCE(excluded.storage_bucket, attachments.storage_bucket),
       storage_path = COALESCE(excluded.storage_path, attachments.storage_path)`,
    [
      data.emailId,
      data.attachmentId,
      data.name,
      data.contentType ?? null,
      data.size ?? null,
      data.storageBucket ?? null,
      data.storagePath ?? null,
    ]
  );

  return Number(result.lastInsertRowid);
}

export function getAttachmentsForEmail(emailId: number): Attachment[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM attachments WHERE email_id = ? ORDER BY name"
    )
    .all(emailId);

  return rows.map(parseAttachmentRow);
}

export function getAttachmentById(id: number): Attachment | null {
  const row = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM attachments WHERE id = ?"
    )
    .get(id);

  return row ? parseAttachmentRow(row) : null;
}

export function getPendingAttachments(limit = 100): Attachment[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM attachments
       WHERE extraction_status = 'pending'
       ORDER BY id
       LIMIT ?`
    )
    .all(limit);

  return rows.map(parseAttachmentRow);
}

export function updateAttachmentExtraction(
  attachmentId: number,
  status: ExtractionStatus,
  extractedText?: string | null,
  error?: string | null
): void {
  db.run(
    `UPDATE attachments
     SET extraction_status = ?,
         extracted_text = ?,
         extraction_error = ?,
         extracted_at = datetime('now')
     WHERE id = ?`,
    [status, extractedText ?? null, error ?? null, attachmentId]
  );
}

export function getAttachmentStats(): {
  total: number;
  pending: number;
  success: number;
  failed: number;
  skipped: number;
} {
  const rows = db
    .query<{ status: string; count: number }, []>(
      `SELECT extraction_status as status, COUNT(*) as count
       FROM attachments
       GROUP BY extraction_status`
    )
    .all();

  const stats = { total: 0, pending: 0, success: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    const count = row.count;
    stats.total += count;
    switch (row.status) {
      case "pending":
        stats.pending = count;
        break;
      case "success":
        stats.success = count;
        break;
      case "failed":
        stats.failed = count;
        break;
      case "skipped":
        stats.skipped = count;
        break;
      default:
        break;
    }
  }
  return stats;
}

export function searchEmailsFullText(
  query: string,
  limit = 50
): Array<Email & { matchSource: "subject" | "body" | "attachment" }> {
  const pattern = `%${query}%`;

  // Search in subject and body_full
  const emailRows = db
    .query<
      Record<string, unknown> & { match_source: string },
      [string, string, string, number]
    >(
      `SELECT *,
        CASE
          WHEN subject LIKE ? THEN 'subject'
          ELSE 'body'
        END as match_source
       FROM emails
       WHERE subject LIKE ? OR body_full LIKE ?
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(pattern, pattern, pattern, limit);

  const results: Array<
    Email & { matchSource: "subject" | "body" | "attachment" }
  > = [];

  for (const row of emailRows) {
    results.push({
      ...parseEmailRow(row),
      matchSource: row.match_source as "subject" | "body",
    });
  }

  // Also search in attachment extracted text
  const attachmentRows = db
    .query<{ email_id: number }, [string, number]>(
      `SELECT DISTINCT email_id
       FROM attachments
       WHERE extracted_text LIKE ?
       LIMIT ?`
    )
    .all(pattern, limit);

  for (const { email_id } of attachmentRows) {
    // Skip if already in results
    if (results.some((r) => r.id === email_id)) {
      continue;
    }

    const email = getEmailById(email_id);
    if (email) {
      results.push({ ...email, matchSource: "attachment" });
    }
  }

  return results.slice(0, limit);
}

export function getEmailsWithAttachments(limit = 100): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM emails
       WHERE has_attachments = 1
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(limit);

  return rows.map(parseEmailRow);
}

export function clearAttachments(): void {
  db.run("DELETE FROM attachments");
}

// ============================================
// Multi-Signal Linking Helpers
// ============================================

/**
 * Find a linked sibling email in the same conversation thread.
 * Returns the project_id of any email in the same conversation that already has a link.
 */
export function getLinkedConversationSibling(
  conversationId: string
): number | null {
  const row = db
    .query<{ project_id: number }, [string]>(
      `SELECT project_id FROM emails
       WHERE conversation_id = ?
       AND project_id IS NOT NULL
       LIMIT 1`
    )
    .get(conversationId);

  return row?.project_id ?? null;
}

/**
 * Get statistics about which project a sender emails about most.
 * Returns the project ID and percentage if sender has a clear pattern.
 */
export function getSenderProjectStats(
  fromEmail: string
): { projectId: number; percentage: number } | null {
  // Get total emails from this sender that have project links
  const totalRow = db
    .query<{ count: number }, [string]>(
      `SELECT COUNT(*) as count FROM emails
       WHERE from_email = ?
       AND project_id IS NOT NULL`
    )
    .get(fromEmail);

  const total = totalRow?.count ?? 0;
  if (total === 0) {
    return null;
  }

  // Get the most common project for this sender
  const topRow = db
    .query<{ project_id: number; count: number }, [string]>(
      `SELECT project_id, COUNT(*) as count FROM emails
       WHERE from_email = ?
       AND project_id IS NOT NULL
       GROUP BY project_id
       ORDER BY count DESC
       LIMIT 1`
    )
    .get(fromEmail);

  if (!topRow) {
    return null;
  }

  const percentage = topRow.count / total;
  return { projectId: topRow.project_id, percentage };
}

/**
 * Strip Re:/FW:/Fwd: prefixes from subject to find the base subject.
 */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fw|fwd):\s*/gi, "")
    .replace(/^(re|fw|fwd):\s*/gi, "") // Run twice for nested prefixes like "Re: FW:"
    .trim()
    .toLowerCase();
}

/**
 * Find emails with the same base subject (reply chain siblings).
 * Returns emails that match the normalized subject.
 */
export function findReplyChainSiblings(subject: string): Email[] {
  const normalized = normalizeSubject(subject);

  // Can't search effectively if normalized subject is too short
  if (normalized.length < 5) {
    return [];
  }

  // Find emails where the normalized subject matches
  const rows = db
    .query<Record<string, unknown>, []>(
      `SELECT * FROM emails
       WHERE subject IS NOT NULL
       ORDER BY received_at DESC
       LIMIT 1000`
    )
    .all();

  // Filter in memory since SQLite doesn't have good regex support
  const matching: Email[] = [];
  for (const row of rows) {
    const rowSubject = row.subject as string | null;
    if (rowSubject && normalizeSubject(rowSubject) === normalized) {
      matching.push(parseEmailRow(row));
    }
  }

  return matching;
}

/**
 * Get all project names for body text matching.
 * Returns a map of project ID to project name.
 */
export function getAllProjectNames(): Map<number, string> {
  const rows = db
    .query<{ id: number; name: string }, []>(
      "SELECT id, name FROM projects WHERE name IS NOT NULL"
    )
    .all();

  const map = new Map<number, string>();
  for (const row of rows) {
    map.set(row.id, row.name);
  }
  return map;
}

/**
 * Search email body text for project name matches.
 * Returns the project ID if a project name is found in the body.
 */
export function searchBodyForProjectMatch(
  bodyText: string,
  projectNames: Map<number, string>
): number | null {
  const lowerBody = bodyText.toLowerCase();

  // Check each project name for a match
  for (const [projectId, projectName] of projectNames) {
    // Skip very short project names (too many false positives)
    if (projectName.length < 4) {
      continue;
    }

    const lowerName = projectName.toLowerCase();

    // Look for the project name as a word boundary match
    // This avoids matching "Mesa" inside "message"
    const escapedName = lowerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedName}\\b`, "i");

    if (regex.test(lowerBody)) {
      return projectId;
    }
  }

  return null;
}

/**
 * Get emails that are unlinked (no project_id) and have body text.
 * These are candidates for multi-signal linking.
 */
export function getUnlinkedEmailsWithBody(limit = 1000): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM emails
       WHERE project_id IS NULL
       AND body_full IS NOT NULL
       AND body_full != ''
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .all(limit);

  return rows.map(parseEmailRow);
}

/**
 * Update an email's project_id link with linking metadata.
 */
export function linkEmailToProjectWithSignal(
  emailId: number,
  projectId: number,
  signal: string,
  confidence: number
): void {
  db.run(
    `UPDATE emails
     SET project_id = ?
     WHERE id = ?`,
    [projectId, emailId]
  );

  // Store the linking signal as an entity for auditability
  insertEntity(emailId, "link_signal", `${signal}:${confidence}`);
}

// ============================================
// Schema: Estimates (Monday.com ESTIMATING board sync)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS estimates (
    id INTEGER PRIMARY KEY,
    monday_item_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    estimate_number TEXT,
    contractor TEXT,
    group_id TEXT,
    group_title TEXT,
    monday_url TEXT,

    -- Account link (from CONTRACTORS board)
    account_monday_id TEXT,
    account_domain TEXT,

    -- Bid info
    bid_status TEXT,
    bid_value REAL,
    awarded_value REAL,
    bid_source TEXT,
    awarded INTEGER DEFAULT 0,
    due_date TEXT,

    -- Location
    location TEXT,

    -- Links
    sharepoint_url TEXT,

    -- File storage (MinIO)
    estimate_storage_bucket TEXT,
    estimate_storage_path TEXT,
    estimate_file_name TEXT,
    estimate_synced_at TEXT,

    -- Optional file storage (future expansion)
    plans_storage_path TEXT,
    contracts_storage_path TEXT,
    noi_storage_path TEXT,

    -- Sync metadata
    synced_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migrations for existing tables (ignore errors if columns already exist)
try {
  db.run("ALTER TABLE estimates ADD COLUMN account_monday_id TEXT");
} catch {
  // Column already exists
}
try {
  db.run("ALTER TABLE estimates ADD COLUMN account_domain TEXT");
} catch {
  // Column already exists
}

db.run(
  "CREATE INDEX IF NOT EXISTS idx_estimates_monday_id ON estimates(monday_item_id)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_estimates_number ON estimates(estimate_number)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_estimates_contractor ON estimates(contractor)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_estimates_synced ON estimates(synced_at)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_estimates_account ON estimates(account_monday_id)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_estimates_domain ON estimates(account_domain)"
);

// ============================================
// Estimate Types
// ============================================

export interface Estimate {
  id: number;
  mondayItemId: string;
  name: string;
  estimateNumber: string | null;
  contractor: string | null;
  groupId: string | null;
  groupTitle: string | null;
  mondayUrl: string | null;
  accountMondayId: string | null;
  accountDomain: string | null;
  bidStatus: string | null;
  bidValue: number | null;
  awardedValue: number | null;
  bidSource: string | null;
  awarded: boolean;
  dueDate: string | null;
  location: string | null;
  sharepointUrl: string | null;
  estimateStorageBucket: string | null;
  estimateStoragePath: string | null;
  estimateFileName: string | null;
  estimateSyncedAt: string | null;
  plansStoragePath: string | null;
  contractsStoragePath: string | null;
  noiStoragePath: string | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertEstimateData {
  mondayItemId: string;
  name: string;
  estimateNumber?: string | null;
  contractor?: string | null;
  groupId?: string | null;
  groupTitle?: string | null;
  mondayUrl?: string | null;
  accountMondayId?: string | null;
  accountDomain?: string | null;
  bidStatus?: string | null;
  bidValue?: number | null;
  awardedValue?: number | null;
  bidSource?: string | null;
  awarded?: boolean;
  dueDate?: string | null;
  location?: string | null;
  sharepointUrl?: string | null;
  estimateStorageBucket?: string | null;
  estimateStoragePath?: string | null;
  estimateFileName?: string | null;
}

// ============================================
// Estimate Functions
// ============================================

function parseEstimateRow(row: Record<string, unknown>): Estimate {
  return {
    id: row.id as number,
    mondayItemId: row.monday_item_id as string,
    name: row.name as string,
    estimateNumber: row.estimate_number as string | null,
    contractor: row.contractor as string | null,
    groupId: row.group_id as string | null,
    groupTitle: row.group_title as string | null,
    mondayUrl: row.monday_url as string | null,
    accountMondayId: row.account_monday_id as string | null,
    accountDomain: row.account_domain as string | null,
    bidStatus: row.bid_status as string | null,
    bidValue: row.bid_value as number | null,
    awardedValue: row.awarded_value as number | null,
    bidSource: row.bid_source as string | null,
    awarded: row.awarded === 1,
    dueDate: row.due_date as string | null,
    location: row.location as string | null,
    sharepointUrl: row.sharepoint_url as string | null,
    estimateStorageBucket: row.estimate_storage_bucket as string | null,
    estimateStoragePath: row.estimate_storage_path as string | null,
    estimateFileName: row.estimate_file_name as string | null,
    estimateSyncedAt: row.estimate_synced_at as string | null,
    plansStoragePath: row.plans_storage_path as string | null,
    contractsStoragePath: row.contracts_storage_path as string | null,
    noiStoragePath: row.noi_storage_path as string | null,
    syncedAt: row.synced_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function upsertEstimate(data: UpsertEstimateData): number {
  db.run(
    `INSERT INTO estimates (
      monday_item_id, name, estimate_number, contractor, group_id, group_title,
      monday_url, account_monday_id, account_domain, bid_status, bid_value,
      awarded_value, bid_source, awarded, due_date, location, sharepoint_url,
      estimate_storage_bucket, estimate_storage_path, estimate_file_name, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(monday_item_id) DO UPDATE SET
      name = excluded.name,
      estimate_number = excluded.estimate_number,
      contractor = excluded.contractor,
      group_id = excluded.group_id,
      group_title = excluded.group_title,
      monday_url = excluded.monday_url,
      account_monday_id = excluded.account_monday_id,
      account_domain = excluded.account_domain,
      bid_status = excluded.bid_status,
      bid_value = excluded.bid_value,
      awarded_value = excluded.awarded_value,
      bid_source = excluded.bid_source,
      awarded = excluded.awarded,
      due_date = excluded.due_date,
      location = excluded.location,
      sharepoint_url = excluded.sharepoint_url,
      estimate_storage_bucket = COALESCE(excluded.estimate_storage_bucket, estimates.estimate_storage_bucket),
      estimate_storage_path = COALESCE(excluded.estimate_storage_path, estimates.estimate_storage_path),
      estimate_file_name = COALESCE(excluded.estimate_file_name, estimates.estimate_file_name),
      synced_at = datetime('now'),
      updated_at = datetime('now')`,
    [
      data.mondayItemId,
      data.name,
      data.estimateNumber ?? null,
      data.contractor ?? null,
      data.groupId ?? null,
      data.groupTitle ?? null,
      data.mondayUrl ?? null,
      data.accountMondayId ?? null,
      data.accountDomain ?? null,
      data.bidStatus ?? null,
      data.bidValue ?? null,
      data.awardedValue ?? null,
      data.bidSource ?? null,
      data.awarded ? 1 : 0,
      data.dueDate ?? null,
      data.location ?? null,
      data.sharepointUrl ?? null,
      data.estimateStorageBucket ?? null,
      data.estimateStoragePath ?? null,
      data.estimateFileName ?? null,
    ]
  );

  const row = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM estimates WHERE monday_item_id = ?"
    )
    .get(data.mondayItemId);

  return row?.id ?? 0;
}

export function updateEstimateStorage(
  mondayItemId: string,
  bucket: string,
  path: string,
  fileName: string
): void {
  db.run(
    `UPDATE estimates
     SET estimate_storage_bucket = ?,
         estimate_storage_path = ?,
         estimate_file_name = ?,
         estimate_synced_at = datetime('now'),
         updated_at = datetime('now')
     WHERE monday_item_id = ?`,
    [bucket, path, fileName, mondayItemId]
  );
}

export function getEstimateByMondayId(mondayItemId: string): Estimate | null {
  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM estimates WHERE monday_item_id = ?"
    )
    .get(mondayItemId);

  return row ? parseEstimateRow(row) : null;
}

export function getEstimateById(id: number): Estimate | null {
  const row = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM estimates WHERE id = ?"
    )
    .get(id);

  return row ? parseEstimateRow(row) : null;
}

export function getAllEstimates(): Estimate[] {
  const rows = db
    .query<Record<string, unknown>, []>(
      "SELECT * FROM estimates ORDER BY synced_at DESC"
    )
    .all();

  return rows.map(parseEstimateRow);
}

export function getEstimatesWithoutFile(): Estimate[] {
  const rows = db
    .query<Record<string, unknown>, []>(
      `SELECT * FROM estimates
       WHERE estimate_storage_path IS NULL
       ORDER BY synced_at DESC`
    )
    .all();

  return rows.map(parseEstimateRow);
}

export function getEstimateStats(): {
  total: number;
  withFile: number;
  withoutFile: number;
} {
  const total =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM estimates")
      .get()?.count ?? 0;

  const withFile =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM estimates WHERE estimate_storage_path IS NOT NULL"
      )
      .get()?.count ?? 0;

  return {
    total,
    withFile,
    withoutFile: total - withFile,
  };
}

export function searchEstimates(query: string, limit = 50): Estimate[] {
  const pattern = `%${query}%`;
  const rows = db
    .query<Record<string, unknown>, [string, string, string, number]>(
      `SELECT * FROM estimates
       WHERE name LIKE ? OR estimate_number LIKE ? OR contractor LIKE ?
       ORDER BY synced_at DESC
       LIMIT ?`
    )
    .all(pattern, pattern, pattern, limit);

  return rows.map(parseEstimateRow);
}

export { db };
