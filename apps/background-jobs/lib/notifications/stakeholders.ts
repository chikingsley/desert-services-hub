/**
 * Stakeholder Management
 *
 * CRUD for stakeholders — who gets notified about what event type.
 */

import { db } from "@lib/db/hub";
import type { NotificationEventType } from "@lib/db/types";

export interface StakeholderRecipient {
  email: string;
  name: string | null;
  role: string | null;
}

export async function getStakeholders(
  eventType: NotificationEventType
): Promise<StakeholderRecipient[]> {
  return await db
    .query<StakeholderRecipient, [string]>(
      "SELECT email, name, role FROM stakeholders WHERE event_type = ? AND is_active = 1"
    )
    .all(eventType);
}

export async function addStakeholder(
  eventType: NotificationEventType,
  email: string,
  name?: string,
  role?: string
): Promise<void> {
  await db.run(
    `INSERT INTO stakeholders (event_type, email, name, role)
     VALUES (?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    [eventType, email, name ?? null, role ?? null]
  );
}

export async function removeStakeholder(
  eventType: NotificationEventType,
  email: string
): Promise<void> {
  await db.run(
    "UPDATE stakeholders SET is_active = 0 WHERE event_type = ? AND email = ?",
    [eventType, email]
  );
}

export async function listAllStakeholders(): Promise<
  Array<{
    eventType: string;
    email: string;
    name: string | null;
    role: string | null;
  }>
> {
  return await db
    .query<
      {
        eventType: string;
        email: string;
        name: string | null;
        role: string | null;
      },
      []
    >(
      `SELECT event_type as eventType, email, name, role
       FROM stakeholders
       WHERE is_active = 1
       ORDER BY event_type, email`
    )
    .all();
}
