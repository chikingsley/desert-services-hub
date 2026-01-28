/**
 * Contract Queue
 *
 * Query census.db for contracts@ emails with attachments,
 * show pending contracts for processing.
 *
 * This is the entry point for the contract processing workflow.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ============================================
// Types
// ============================================

export interface QueuedContract {
  /** Normalized subject (grouped across replies/forwards) */
  normalizedSubject: string;
  /** Number of emails in this thread */
  emailCount: number;
  /** Earliest email in thread */
  firstSeen: string;
  /** Latest email in thread */
  lastSeen: string;
  /** Whether thread has attachments */
  hasAttachments: boolean;
  /** Names of attachments (all from thread) */
  attachmentNames: string[];
  /** From email of the most recent message */
  latestFrom: string;
  /** GC/Contractor name if identified */
  contractorName: string | null;
  /** Whether this is linked to a Monday estimate */
  mondayEstimateId: string | null;
  /** Processing status */
  status: "pending" | "in_progress" | "processed" | "needs_attention";
}

export interface ContractEmail {
  id: number;
  messageId: string;
  subject: string;
  normalizedSubject: string;
  fromEmail: string;
  fromName: string | null;
  receivedAt: string;
  hasAttachments: boolean;
  attachmentNames: string[];
  bodyPreview: string | null;
  webUrl: string | null;
  conversationId: string | null;
  contractorName: string | null;
  mondayEstimateId: string | null;
}

export interface Attachment {
  id: number;
  emailId: number;
  name: string;
  contentType: string | null;
  size: number | null;
  storagePath: string | null;
  extractedText: string | null;
  extractionStatus: string;
}

// ============================================
// Database Connection
// ============================================

function getDatabase(): Database {
  // Default path relative to census module
  const defaultPath = join(import.meta.dir, "../../email/census/census.db");
  const dbPath = process.env.CENSUS_DATABASE_PATH ?? defaultPath;

  if (!existsSync(dbPath)) {
    throw new Error(`Census database not found at: ${dbPath}`);
  }

  return new Database(dbPath, { readonly: true });
}

// ============================================
// Query Functions
// ============================================

/**
 * Get all unique contracts from contracts@ mailbox, grouped by normalized subject.
 * This shows the "queue" of contracts waiting to be processed.
 */
export function getContractQueue(): QueuedContract[] {
  const db = getDatabase();

  try {
    // First get the contracts@ mailbox ID
    const mailbox = db
      .query<{ id: number }, []>(
        "SELECT id FROM mailboxes WHERE email = 'contracts@desertservices.net'"
      )
      .get();

    if (!mailbox) {
      console.warn("No contracts@ mailbox found in census.db");
      return [];
    }

    // Query for unique contracts grouped by normalized subject
    const rows = db
      .query<
        {
          normalized_subject: string;
          email_count: number;
          first_seen: string;
          last_seen: string;
          has_attachments: number;
          latest_from: string;
          contractor_name: string | null;
          monday_estimate_id: string | null;
        },
        [number, number]
      >(
        `
        SELECT
          normalized_subject,
          COUNT(*) as email_count,
          MIN(received_at) as first_seen,
          MAX(received_at) as last_seen,
          MAX(has_attachments) as has_attachments,
          (SELECT from_email FROM emails e2
           WHERE e2.mailbox_id = ? AND e2.normalized_subject = e.normalized_subject
           ORDER BY received_at DESC LIMIT 1) as latest_from,
          contractor_name,
          monday_estimate_id
        FROM emails e
        WHERE mailbox_id = ?
          AND normalized_subject IS NOT NULL
          AND normalized_subject != ''
        GROUP BY normalized_subject
        ORDER BY last_seen DESC
      `
      )
      .all(mailbox.id, mailbox.id);

    // Enrich with attachment info
    return rows.map((row) => {
      // Get all attachment names for this thread
      const attachments = db
        .query<{ name: string }, [number, string]>(
          `
          SELECT DISTINCT a.name
          FROM attachments a
          JOIN emails e ON a.email_id = e.id
          WHERE e.mailbox_id = ?
            AND e.normalized_subject = ?
        `
        )
        .all(mailbox.id, row.normalized_subject);

      return {
        normalizedSubject: row.normalized_subject,
        emailCount: row.email_count,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        hasAttachments: row.has_attachments === 1,
        attachmentNames: attachments.map((a) => a.name),
        latestFrom: row.latest_from,
        contractorName: row.contractor_name,
        mondayEstimateId: row.monday_estimate_id,
        status: row.monday_estimate_id ? "processed" : "pending",
      };
    });
  } finally {
    db.close();
  }
}

/**
 * Get pending contracts (not yet linked to Monday estimate).
 */
export function getPendingContracts(): QueuedContract[] {
  return getContractQueue().filter((c) => c.status === "pending");
}

/**
 * Get contracts that have attachments (most useful for processing).
 */
export function getContractsWithAttachments(): QueuedContract[] {
  return getContractQueue().filter((c) => c.hasAttachments);
}

/**
 * Search the contract queue by keyword.
 */
export function searchContractQueue(query: string): QueuedContract[] {
  const normalized = query.toLowerCase();
  return getContractQueue().filter(
    (c) =>
      c.normalizedSubject.toLowerCase().includes(normalized) ||
      (c.contractorName?.toLowerCase().includes(normalized) ?? false) ||
      c.latestFrom.toLowerCase().includes(normalized) ||
      c.attachmentNames.some((a) => a.toLowerCase().includes(normalized))
  );
}

/**
 * Get all emails for a specific contract thread.
 */
export function getContractEmails(normalizedSubject: string): ContractEmail[] {
  const db = getDatabase();

  try {
    const mailbox = db
      .query<{ id: number }, []>(
        "SELECT id FROM mailboxes WHERE email = 'contracts@desertservices.net'"
      )
      .get();

    if (!mailbox) {
      return [];
    }

    const rows = db
      .query<
        {
          id: number;
          message_id: string;
          subject: string;
          normalized_subject: string;
          from_email: string;
          from_name: string | null;
          received_at: string;
          has_attachments: number;
          attachment_names: string;
          body_preview: string | null;
          web_url: string | null;
          conversation_id: string | null;
          contractor_name: string | null;
          monday_estimate_id: string | null;
        },
        [number, string]
      >(
        `
        SELECT
          id, message_id, subject, normalized_subject,
          from_email, from_name, received_at,
          has_attachments, attachment_names, body_preview,
          web_url, conversation_id, contractor_name, monday_estimate_id
        FROM emails
        WHERE mailbox_id = ?
          AND normalized_subject = ?
        ORDER BY received_at ASC
      `
      )
      .all(mailbox.id, normalizedSubject);

    return rows.map((row) => ({
      id: row.id,
      messageId: row.message_id,
      subject: row.subject,
      normalizedSubject: row.normalized_subject,
      fromEmail: row.from_email,
      fromName: row.from_name,
      receivedAt: row.received_at,
      hasAttachments: row.has_attachments === 1,
      attachmentNames: JSON.parse(row.attachment_names || "[]"),
      bodyPreview: row.body_preview,
      webUrl: row.web_url,
      conversationId: row.conversation_id,
      contractorName: row.contractor_name,
      mondayEstimateId: row.monday_estimate_id,
    }));
  } finally {
    db.close();
  }
}

/**
 * Get attachments for a specific email.
 */
export function getEmailAttachments(emailId: number): Attachment[] {
  const db = getDatabase();

  try {
    const rows = db
      .query<
        {
          id: number;
          email_id: number;
          name: string;
          content_type: string | null;
          size: number | null;
          storage_path: string | null;
          extracted_text: string | null;
          extraction_status: string;
        },
        [number]
      >(
        `
        SELECT id, email_id, name, content_type, size,
               storage_path, extracted_text, extraction_status
        FROM attachments
        WHERE email_id = ?
        ORDER BY name
      `
      )
      .all(emailId);

    return rows.map((row) => ({
      id: row.id,
      emailId: row.email_id,
      name: row.name,
      contentType: row.content_type,
      size: row.size,
      storagePath: row.storage_path,
      extractedText: row.extracted_text,
      extractionStatus: row.extraction_status,
    }));
  } finally {
    db.close();
  }
}

/**
 * Get all attachments for a contract thread (by normalized subject).
 */
export function getContractAttachments(
  normalizedSubject: string
): Attachment[] {
  const emails = getContractEmails(normalizedSubject);
  const attachments: Attachment[] = [];

  for (const email of emails) {
    const emailAttachments = getEmailAttachments(email.id);
    attachments.push(...emailAttachments);
  }

  return attachments;
}

/**
 * Get PDF attachments only (most relevant for contract processing).
 */
export function getContractPDFs(normalizedSubject: string): Attachment[] {
  return getContractAttachments(normalizedSubject).filter(
    (a) =>
      a.name.toLowerCase().endsWith(".pdf") ||
      a.contentType === "application/pdf"
  );
}

// ============================================
// Display Helpers
// ============================================

/**
 * Format queue for display.
 */
export function formatQueueDisplay(contracts: QueuedContract[]): string {
  const lines: string[] = [];

  lines.push("# Contract Queue");
  lines.push(`Total: ${contracts.length} contracts`);
  lines.push("");

  for (let i = 0; i < contracts.length; i++) {
    const c = contracts[i];
    let status = "[?]";
    if (c.status === "pending") {
      status = "[ ]";
    } else if (c.status === "processed") {
      status = "[x]";
    }

    lines.push(`${i + 1}. ${status} ${c.normalizedSubject}`);
    lines.push(`   From: ${c.latestFrom}`);
    lines.push(
      `   Emails: ${c.emailCount} | Attachments: ${c.hasAttachments ? c.attachmentNames.length : 0}`
    );
    lines.push(`   Last: ${c.lastSeen}`);
    if (c.attachmentNames.length > 0) {
      lines.push(
        `   Files: ${c.attachmentNames.slice(0, 3).join(", ")}${c.attachmentNames.length > 3 ? "..." : ""}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format contract details for display.
 */
export function formatContractDetails(normalizedSubject: string): string {
  const emails = getContractEmails(normalizedSubject);
  const attachments = getContractAttachments(normalizedSubject);

  const lines: string[] = [];

  lines.push(`# ${normalizedSubject}`);
  lines.push("");
  lines.push(`## Emails (${emails.length})`);
  lines.push("");

  for (const email of emails) {
    lines.push(`### ${email.receivedAt}`);
    lines.push(`From: ${email.fromName ?? email.fromEmail}`);
    lines.push(`Subject: ${email.subject}`);
    if (email.bodyPreview) {
      lines.push(`Preview: ${email.bodyPreview.substring(0, 200)}...`);
    }
    if (email.hasAttachments) {
      lines.push(`Attachments: ${email.attachmentNames.join(", ")}`);
    }
    lines.push("");
  }

  lines.push(`## Attachments (${attachments.length})`);
  lines.push("");

  for (const att of attachments) {
    let status = "✗";
    if (att.extractionStatus === "success") {
      status = "✓";
    } else if (att.extractionStatus === "pending") {
      status = "⏳";
    }
    const size = att.size ? `${Math.round(att.size / 1024)}KB` : "?";
    lines.push(`- ${status} ${att.name} (${size})`);
  }

  return lines.join("\n");
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0] || "list";

  switch (command) {
    case "list": {
      const contracts = getContractQueue();
      console.log(formatQueueDisplay(contracts));
      break;
    }

    case "pending": {
      const pending = getPendingContracts();
      console.log(formatQueueDisplay(pending));
      break;
    }

    case "with-attachments": {
      const withAttachments = getContractsWithAttachments();
      console.log(formatQueueDisplay(withAttachments));
      break;
    }

    case "search": {
      const query = args[1];
      if (!query) {
        console.error("Usage: queue.ts search <query>");
        process.exit(1);
      }
      const results = searchContractQueue(query);
      console.log(formatQueueDisplay(results));
      break;
    }

    case "details": {
      const subject = args.slice(1).join(" ");
      if (!subject) {
        console.error("Usage: queue.ts details <normalized subject>");
        process.exit(1);
      }
      console.log(formatContractDetails(subject));
      break;
    }

    default:
      console.log(`
Contract Queue Commands:

  bun services/contract/workflow/queue.ts list
    List all contracts in the queue

  bun services/contract/workflow/queue.ts pending
    List only pending (unprocessed) contracts

  bun services/contract/workflow/queue.ts with-attachments
    List contracts that have attachments

  bun services/contract/workflow/queue.ts search <query>
    Search contracts by keyword

  bun services/contract/workflow/queue.ts details <subject>
    Show details for a specific contract thread
      `);
  }
}
