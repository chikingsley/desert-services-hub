#!/usr/bin/env bun

/**
 * Notifications — Status
 *
 * Shows stakeholder configuration and recent notification history.
 *
 * Usage:
 *   bun cli/status.ts
 */

import { db } from "@lib/db/hub";
import { listAllStakeholders } from "@notifications/lib/stakeholders";

console.log("Notification Stakeholders");
console.log("=========================\n");

const stakeholders = await listAllStakeholders();
if (stakeholders.length === 0) {
  console.log(
    "  No stakeholders configured. Run: bun cli/seed-stakeholders.ts\n"
  );
} else {
  let currentEvent = "";
  for (const s of stakeholders) {
    if (s.eventType !== currentEvent) {
      currentEvent = s.eventType;
      console.log(`  ${currentEvent}:`);
    }
    const label = s.name ? `${s.name} (${s.email})` : s.email;
    const role = s.role ? ` [${s.role}]` : "";
    console.log(`    - ${label}${role}`);
  }
}

console.log("\nRecent Notifications");
console.log("====================\n");

const recent = await db
  .query<
    {
      event_type: string;
      subject: string;
      status: string;
      draft_id: string | null;
      error: string | null;
      created_at: string;
    },
    []
  >(
    `SELECT event_type, subject, status, draft_id, error, created_at
     FROM notifications
     ORDER BY created_at DESC
     LIMIT 20`
  )
  .all();

if (recent.length === 0) {
  console.log("  No notifications yet.");
} else {
  for (const n of recent) {
    const details: string[] = [];
    if (n.draft_id) {
      details.push(`draft=${n.draft_id}`);
    }
    if (n.error) {
      details.push(`error=${n.error}`);
    }
    const detailText = details.length > 0 ? ` [${details.join(", ")}]` : "";
    console.log(
      `  [${n.status}] ${n.event_type}: ${n.subject}${detailText} (${n.created_at})`
    );
  }
}

const counts = await db
  .query<{ status: string; count: number }, []>(
    "SELECT status, COUNT(*) as count FROM notifications GROUP BY status"
  )
  .all();

if (counts.length > 0) {
  console.log("\nTotals:");
  for (const c of counts) {
    console.log(`  ${c.status}: ${c.count}`);
  }
}
