import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import {
  deleteOutlookSubscription,
  deleteOutlookSubscriptionsForMailbox,
  deleteOutlookSubscriptionsForMailboxExcept,
  listOutlookSubscriptionsForMailbox,
  upsertOutlookSubscription,
} from "@email/db/outlook-subscription";

const RUN_TAG = crypto.randomUUID().slice(0, 8).toLowerCase();
const MAILBOX_EMAIL = `_test_outlook_sub_${RUN_TAG}@example.com`;
const SUB_A = `sub-${RUN_TAG}-a`;
const SUB_B = `sub-${RUN_TAG}-b`;

let mailboxId = 0;

beforeAll(async () => {
  const rows = (await db.run(
    `INSERT INTO mailboxes (email, display_name)
     VALUES ($1, $2)
     ON CONFLICT (email)
     DO UPDATE SET updated_at = now()
     RETURNING id`,
    [MAILBOX_EMAIL, `Test Outlook Sub ${RUN_TAG}`]
  )) as Array<{ id: number }>;
  mailboxId = Number(rows[0]?.id ?? 0);
  if (!mailboxId) {
    throw new Error("Failed to create mailbox for outlook subscription test");
  }
});

afterAll(async () => {
  await deleteOutlookSubscriptionsForMailbox(MAILBOX_EMAIL);
  await db.run("DELETE FROM mailboxes WHERE id = $1", [mailboxId]);
});

describe("outlook subscription repository", () => {
  test("upserts and reads subscriptions for a mailbox", async () => {
    const first = await upsertOutlookSubscription({
      subscriptionId: SUB_A,
      mailboxId,
      mailboxEmail: MAILBOX_EMAIL,
      resource: `users/${MAILBOX_EMAIL}/messages`,
      changeType: "created,updated",
      expiration: "2026-03-01T00:00:00.000Z",
      clientState: "state-a",
    });

    expect(first.subscriptionId).toBe(SUB_A);
    expect(first.mailboxEmail).toBe(MAILBOX_EMAIL);
    expect(first.changeType).toBe("created,updated");

    const updated = await upsertOutlookSubscription({
      subscriptionId: SUB_A,
      mailboxId,
      mailboxEmail: MAILBOX_EMAIL,
      resource: `users/${MAILBOX_EMAIL}/messages`,
      changeType: "created",
      expiration: "2026-03-02T00:00:00.000Z",
      clientState: "state-b",
    });

    expect(new Date(updated.expiration).toISOString()).toBe(
      "2026-03-02T00:00:00.000Z"
    );
    expect(updated.changeType).toBe("created");
    expect(updated.clientState).toBe("state-b");

    const rows = await listOutlookSubscriptionsForMailbox(MAILBOX_EMAIL);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.subscriptionId).toBe(SUB_A);
  });

  test("deletes non-primary mailbox subscriptions with deleteExcept", async () => {
    await upsertOutlookSubscription({
      subscriptionId: SUB_B,
      mailboxId,
      mailboxEmail: MAILBOX_EMAIL,
      resource: `users/${MAILBOX_EMAIL}/messages`,
      changeType: "created,updated",
      expiration: "2026-03-03T00:00:00.000Z",
      clientState: "state-c",
    });

    const removed = await deleteOutlookSubscriptionsForMailboxExcept(
      MAILBOX_EMAIL,
      SUB_B
    );
    expect(removed.some((row) => row.subscriptionId === SUB_A)).toBe(true);

    const remaining = await listOutlookSubscriptionsForMailbox(MAILBOX_EMAIL);
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.subscriptionId).toBe(SUB_B);

    const deleted = await deleteOutlookSubscription(SUB_B);
    expect(deleted).toBe(1);
  });
});
