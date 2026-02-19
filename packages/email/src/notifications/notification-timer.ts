/**
 * Notification Timer Helpers
 *
 * processQueuedNotifications and deliverNewEvents extracted from worker.ts
 * to keep that file under the 500-line limit.
 *
 * initNotificationTimer() stays in worker.ts because it calls registerTimer(),
 * which is defined there — moving it here would create a circular dependency.
 */

import {
  type createDraftClientFromEnv,
  createNotificationDraft,
} from "./delivery";
import {
  loadQueuedNotifications,
  recordNotification,
  updateNotificationStatus,
} from "./events";
import { getStakeholders } from "./stakeholders";
import type { NotificationDeliveryMode, PendingEvent } from "./types";

export async function processQueuedNotifications(
  client: ReturnType<typeof createDraftClientFromEnv>,
  maxEvents: number,
  mailbox: string
): Promise<number> {
  const queued = await loadQueuedNotifications(maxEvents);
  let processed = 0;

  for (const queuedNotification of queued) {
    const event = queuedNotification.event;
    const stakeholders = await getStakeholders(event.eventType);

    if (stakeholders.length === 0) {
      await updateNotificationStatus(queuedNotification.id, "failed", {
        error: "No active stakeholders configured for event type",
      });
      processed++;
      continue;
    }

    try {
      const draft = await createNotificationDraft({
        client,
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
    processed++;
  }

  return processed;
}

export async function deliverNewEvents(
  events: PendingEvent[],
  deliveryMode: NotificationDeliveryMode,
  draftClient: ReturnType<typeof createDraftClientFromEnv> | null,
  mailbox: string
): Promise<void> {
  for (const event of events) {
    const stakeholders = await getStakeholders(event.eventType);
    const recipientList = stakeholders.map((s) => s.email).join(", ");

    console.log(
      `[worker]   [${event.eventType}] ${event.subject} → ${recipientList || "(no stakeholders)"}`
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
}
