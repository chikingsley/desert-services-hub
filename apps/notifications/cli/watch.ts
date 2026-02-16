#!/usr/bin/env bun

/**
 * Notifications — Watch Loop
 *
 * Polls Supabase Postgres for events that need notifications (permit expirations,
 * estimate wins, etc.) and creates notification entries or Outlook drafts.
 *
 * Usage:
 *   bun cli/watch.ts                                  # Continuous polling (log-only by default)
 *   bun cli/watch.ts --once                           # Single check then exit
 *   bun cli/watch.ts --interval=60000                 # Custom interval (ms)
 *   bun cli/watch.ts --delivery=log                   # Log only (no drafts)
 *   bun cli/watch.ts --delivery=draft --mailbox=...   # Create Outlook drafts
 *   bun cli/watch.ts --once --max=25                  # Process up to 25 events
 */

import {
  createDraftClientFromEnv,
  createNotificationDraft,
  type NotificationDeliveryMode,
} from "@notifications/lib/delivery";
import {
  detectAllEvents,
  loadQueuedNotifications,
  recordNotification,
  updateNotificationStatus,
} from "@notifications/lib/events";
import { getStakeholders } from "@notifications/lib/stakeholders";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_EVENTS = 100;
const DEFAULT_MAILBOX = "chi@desertservices.net";

const args = process.argv.slice(2);
const once = args.includes("--once");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const deliveryArg = args.find((a) => a.startsWith("--delivery="));
const mailboxArg = args.find((a) => a.startsWith("--mailbox="));
const maxArg = args.find((a) => a.startsWith("--max="));

function parseDeliveryMode(
  value: string | undefined
): NotificationDeliveryMode {
  if (!value) {
    return "log";
  }
  if (value === "log" || value === "draft") {
    return value;
  }
  throw new Error(
    `Invalid delivery mode "${value}". Use --delivery=log or --delivery=draft`
  );
}

const interval = intervalArg
  ? Number.parseInt(
      intervalArg.split("=")[1] ?? String(DEFAULT_INTERVAL_MS),
      10
    )
  : DEFAULT_INTERVAL_MS;
const mailbox =
  mailboxArg?.split("=")[1] ??
  process.env.NOTIFICATIONS_MAILBOX ??
  DEFAULT_MAILBOX;
const maxEvents = maxArg
  ? Number.parseInt(maxArg.split("=")[1] ?? String(DEFAULT_MAX_EVENTS), 10)
  : DEFAULT_MAX_EVENTS;

let deliveryMode = parseDeliveryMode(deliveryArg?.split("=")[1]);

let draftClient: ReturnType<typeof createDraftClientFromEnv> | null = null;
if (deliveryMode === "draft") {
  try {
    draftClient = createDraftClientFromEnv();
  } catch (err) {
    console.warn(
      `[Notifications] Draft mode disabled: ${(err as Error).message}`
    );
    console.warn("[Notifications] Falling back to log mode.");
    deliveryMode = "log";
  }
}

async function run(): Promise<void> {
  console.log(`[Notifications] ${new Date().toISOString()}`);

  try {
    let processedCount = 0;
    const cappedMax = Math.max(0, maxEvents);

    if (deliveryMode === "draft" && draftClient) {
      const queued = await loadQueuedNotifications(cappedMax);
      if (queued.length > 0) {
        console.log(
          `  Processing ${queued.length} queued pending notification(s).`
        );
      }

      for (const queuedNotification of queued) {
        const event = queuedNotification.event;
        const stakeholders = await getStakeholders(event.eventType);
        const recipientList = stakeholders.map((s) => s.email).join(", ");

        console.log(
          `  [queued:${event.eventType}] ${event.subject} → ${recipientList || "(no stakeholders)"}`
        );

        if (stakeholders.length === 0) {
          await updateNotificationStatus(queuedNotification.id, "failed", {
            error: "No active stakeholders configured for event type",
          });
          processedCount++;
          continue;
        }

        try {
          const draft = await createNotificationDraft({
            client: draftClient,
            event,
            stakeholders,
            mailbox,
          });
          await updateNotificationStatus(queuedNotification.id, "drafted", {
            draftId: draft.id,
          });
        } catch (err) {
          await updateNotificationStatus(queuedNotification.id, "failed", {
            error: (err as Error).message,
          });
        }
        processedCount++;
      }
    }

    const remainingBudget = Math.max(0, cappedMax - processedCount);
    const events = remainingBudget > 0 ? await detectAllEvents() : [];
    const pendingEvents = events.slice(0, remainingBudget);

    if (pendingEvents.length === 0) {
      if (processedCount === 0) {
        console.log("  No pending events.");
      }
      return;
    }

    if (events.length > pendingEvents.length) {
      console.log(
        `  Found ${events.length} pending event(s), processing first ${pendingEvents.length}.`
      );
    } else {
      console.log(`  Found ${pendingEvents.length} pending event(s):`);
    }

    for (const event of pendingEvents) {
      const stakeholders = await getStakeholders(event.eventType);
      const recipientList = stakeholders.map((s) => s.email).join(", ");

      console.log(
        `  [${event.eventType}] ${event.subject} → ${recipientList || "(no stakeholders)"}`
      );

      if (stakeholders.length === 0) {
        await recordNotification(
          event,
          "failed",
          undefined,
          "No active stakeholders configured for event type"
        );
        continue;
      }

      if (deliveryMode === "log" || !draftClient) {
        await recordNotification(event, "pending");
        continue;
      }

      try {
        const draft = await createNotificationDraft({
          client: draftClient,
          event,
          stakeholders,
          mailbox,
        });
        await recordNotification(event, "drafted", draft.id);
      } catch (err) {
        await recordNotification(
          event,
          "failed",
          undefined,
          (err as Error).message
        );
      }
    }
  } catch (err) {
    console.error("[Notifications] Error:", err);
  }
}

console.log(
  `[Notifications] Starting. Interval: ${interval}ms, Once: ${once}, Mode: ${deliveryMode}, Mailbox: ${mailbox}, Max: ${maxEvents}`
);

if (once) {
  await run();
} else {
  while (true) {
    await run();
    console.log(
      `[Notifications] Next check at ${new Date(Date.now() + interval).toISOString()}\n`
    );
    await Bun.sleep(interval);
  }
}
