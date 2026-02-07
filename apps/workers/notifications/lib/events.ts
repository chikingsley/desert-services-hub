/**
 * Notification Events — Detection Logic
 *
 * Checks hub.db for events that need notifications:
 * - Dust permits approaching expiration
 * - Estimates marked as Won
 * - New contracts received
 *
 * Each detector returns pending events that haven't been notified yet.
 */

import { db } from "@lib/db/hub";
import type { NotificationEventType, NotificationStatus } from "@lib/db/types";

export interface PendingEvent {
  eventType: NotificationEventType;
  refType: string;
  refId: string;
  subject: string;
  metadata: Record<string, unknown>;
}

/**
 * Find dust permits expiring within N days that haven't been notified.
 */
export async function detectExpiringPermits(
  withinDays = 30
): Promise<PendingEvent[]> {
  const cutoff = new Date(
    Date.now() + withinDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const today = new Date().toISOString().split("T")[0];

  const permits = await db
    .query<
      {
        id: string;
        project_name: string | null;
        expiration_date: string;
        company_name: string | null;
        address: string | null;
      },
      [string, string]
    >(
      `SELECT p.id, p.project_name, p.expiration_date, p.company_name, p.address
       FROM dust_permits_filed_by_desert_services p
       WHERE p.status = 'Active'
         AND p.expiration_date IS NOT NULL
         AND p.expiration_date <= ?
         AND p.expiration_date >= ?
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.event_type = 'dust_permit_expiring'
             AND n.ref_type = 'permit'
             AND n.ref_id = p.id
             AND n.status IN ('pending', 'drafted', 'sent')
         )`
    )
    .all(cutoff, today ?? "");

  return permits.map((p) => ({
    eventType: "dust_permit_expiring" as const,
    refType: "permit",
    refId: p.id,
    subject: `Dust Permit Expiring - ${p.project_name ?? p.id}`,
    metadata: {
      permitId: p.id,
      projectName: p.project_name,
      companyName: p.company_name,
      expirationDate: p.expiration_date,
      address: p.address,
    },
  }));
}

/**
 * Find estimates recently marked as Won that haven't been notified.
 */
export async function detectWonEstimates(): Promise<PendingEvent[]> {
  const estimates = await db
    .query<
      {
        id: number;
        name: string;
        contractor: string | null;
        awarded_value: number | null;
        monday_item_id: string | null;
      },
      []
    >(
      `SELECT e.id, e.name, e.contractor, e.awarded_value, e.monday_item_id
       FROM estimates e
       WHERE e.bid_status = 'Won'
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.event_type = 'estimate_won'
             AND n.ref_type = 'estimate'
             AND n.ref_id = CAST(e.id AS TEXT)
             AND n.status IN ('pending', 'drafted', 'sent')
         )`
    )
    .all();

  return estimates.map((e) => ({
    eventType: "estimate_won" as const,
    refType: "estimate",
    refId: String(e.id),
    subject: `Estimate Won - ${e.name}`,
    metadata: {
      estimateId: e.id,
      name: e.name,
      contractor: e.contractor,
      awardedValue: e.awarded_value,
      mondayItemId: e.monday_item_id,
    },
  }));
}

/**
 * Find permits recently submitted that haven't been notified.
 */
export async function detectSubmittedPermits(): Promise<PendingEvent[]> {
  const permits = await db
    .query<
      {
        id: string;
        project_name: string | null;
        company_name: string | null;
        submitted_date: string | null;
        address: string | null;
        expiration_date: string | null;
      },
      []
    >(
      `SELECT p.id, p.project_name, p.company_name, p.submitted_date, p.address, p.expiration_date
       FROM dust_permits_filed_by_desert_services p
       WHERE p.status = 'Submitted'
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.event_type = 'dust_permit_submitted'
             AND n.ref_type = 'permit'
             AND n.ref_id = p.id
             AND n.status IN ('pending', 'drafted', 'sent')
         )`
    )
    .all();

  return permits.map((p) => ({
    eventType: "dust_permit_submitted" as const,
    refType: "permit",
    refId: p.id,
    subject: `Dust Permit Submitted - ${p.project_name ?? p.id}`,
    metadata: {
      permitId: p.id,
      projectName: p.project_name,
      companyName: p.company_name,
      submittedDate: p.submitted_date,
      expirationDate: p.expiration_date,
      address: p.address,
    },
  }));
}

/**
 * Find permits recently issued (Active) that haven't been notified.
 */
export async function detectIssuedPermits(): Promise<PendingEvent[]> {
  const permits = await db
    .query<
      {
        id: string;
        project_name: string | null;
        company_name: string | null;
        effective_date: string | null;
        expiration_date: string | null;
        address: string | null;
      },
      []
    >(
      `SELECT p.id, p.project_name, p.company_name, p.effective_date, p.expiration_date, p.address
       FROM dust_permits_filed_by_desert_services p
       WHERE p.status = 'Active'
         AND p.effective_date IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.event_type = 'dust_permit_issued'
             AND n.ref_type = 'permit'
             AND n.ref_id = p.id
             AND n.status IN ('pending', 'drafted', 'sent')
         )`
    )
    .all();

  return permits.map((p) => ({
    eventType: "dust_permit_issued" as const,
    refType: "permit",
    refId: p.id,
    subject: `Dust Permit Issued - ${p.project_name ?? p.id}`,
    metadata: {
      permitId: p.id,
      projectName: p.project_name,
      companyName: p.company_name,
      effectiveDate: p.effective_date,
      expirationDate: p.expiration_date,
      address: p.address,
    },
  }));
}

/**
 * Find recently received contract emails that haven't been notified.
 */
export async function detectReceivedContracts(
  withinDays = 7
): Promise<PendingEvent[]> {
  const since = new Date(
    Date.now() - withinDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const contracts = await db
    .query<
      {
        id: number;
        subject: string | null;
        from_email: string | null;
        project_id: number | null;
        web_url: string | null;
        received_at: string;
      },
      [string]
    >(
      `SELECT e.id, e.subject, e.from_email, e.project_id, e.web_url, e.received_at
       FROM emails e
       WHERE e.classification = 'CONTRACT'
         AND e.received_at >= ?
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.event_type = 'contract_received'
             AND n.ref_type = 'email'
             AND n.ref_id = CAST(e.id AS TEXT)
             AND n.status IN ('pending', 'drafted', 'sent')
         )
       ORDER BY e.received_at DESC
       LIMIT 200`
    )
    .all(since);

  return contracts.map((c) => ({
    eventType: "contract_received" as const,
    refType: "email",
    refId: String(c.id),
    subject: `Contract Received - ${c.subject ?? `Email ${c.id}`}`,
    metadata: {
      emailId: c.id,
      emailSubject: c.subject,
      fromEmail: c.from_email,
      projectId: c.project_id,
      webUrl: c.web_url,
      receivedAt: c.received_at,
    },
  }));
}

/**
 * Run all detectors and return all pending events.
 */
export async function detectAllEvents(): Promise<PendingEvent[]> {
  return [
    ...(await detectExpiringPermits()),
    ...(await detectWonEstimates()),
    ...(await detectSubmittedPermits()),
    ...(await detectIssuedPermits()),
    ...(await detectReceivedContracts()),
  ];
}

/**
 * Record a notification in the log.
 */
export async function recordNotification(
  event: PendingEvent,
  status: "pending" | "drafted" | "sent" | "failed",
  draftId?: string,
  error?: string
): Promise<number> {
  const result = await db.run(
    `INSERT INTO notifications (event_type, ref_type, ref_id, subject, draft_id, status, error, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.eventType,
      event.refType,
      event.refId,
      event.subject,
      draftId ?? null,
      status,
      error ?? null,
      JSON.stringify(event.metadata),
    ]
  );
  return Number(result.lastInsertRowid);
}

export interface QueuedNotification {
  id: number;
  event: PendingEvent;
}

/**
 * Load existing queued notifications that were already recorded as pending.
 */
export async function loadQueuedNotifications(
  limit = 100
): Promise<QueuedNotification[]> {
  const rows = await db
    .query<
      {
        id: number;
        event_type: string;
        ref_type: string | null;
        ref_id: string | null;
        subject: string;
        metadata: string | null;
      },
      [number]
    >(
      `SELECT id, event_type, ref_type, ref_id, subject, metadata
       FROM notifications
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(limit);

  return rows.map((row) => {
    let metadata: Record<string, unknown> = {};
    if (row.metadata) {
      try {
        const parsed = JSON.parse(row.metadata) as Record<string, unknown>;
        metadata = parsed;
      } catch {
        metadata = {};
      }
    }

    return {
      id: row.id,
      event: {
        eventType: row.event_type as NotificationEventType,
        refType: row.ref_type ?? "unknown",
        refId: row.ref_id ?? String(row.id),
        subject: row.subject,
        metadata,
      },
    };
  });
}

/**
 * Update an existing queued notification status after delivery attempt.
 */
export async function updateNotificationStatus(
  id: number,
  status: NotificationStatus,
  options?: { draftId?: string; error?: string }
): Promise<void> {
  await db.run(
    `UPDATE notifications
     SET status = ?,
         draft_id = COALESCE(?, draft_id),
         error = ?,
         sent_at = CASE WHEN ? = 'sent' THEN now() ELSE sent_at END
     WHERE id = ?`,
    [status, options?.draftId ?? null, options?.error ?? null, status, id]
  );
}
