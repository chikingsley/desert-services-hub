import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@trigger.dev/sdk", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  schedules: {
    task: <T>(definition: T) => definition,
  },
  schemaTask: <T>(definition: T) => definition,
}));

describe("outlook webhook subscription helpers", () => {
  afterEach(() => {
    mock.restore();
    process.env.OUTLOOK_WEBHOOK_URL = undefined;
    process.env.WEBHOOK_BASE_URL = undefined;
  });

  test("resolveOutlookWebhookUrl prefers explicit OUTLOOK_WEBHOOK_URL", async () => {
    process.env.OUTLOOK_WEBHOOK_URL = "https://hooks.example.com/outlook";
    process.env.WEBHOOK_BASE_URL = "https://ignored.example.com";

    const cacheBuster = `outlook-sub-url-explicit-${Date.now()}-${Math.random()}`;
    const { resolveOutlookWebhookUrl } = await import(
      `../../../apps/trigger-dev/src/trigger/outlook-webhook-subscriptions.ts?${cacheBuster}`
    );

    expect(resolveOutlookWebhookUrl()).toBe(
      "https://hooks.example.com/outlook"
    );
  });

  test("resolveOutlookWebhookUrl builds from WEBHOOK_BASE_URL", async () => {
    process.env.WEBHOOK_BASE_URL = "https://webhooks.example.com/";

    const cacheBuster = `outlook-sub-url-base-${Date.now()}-${Math.random()}`;
    const { resolveOutlookWebhookUrl } = await import(
      `../../../apps/trigger-dev/src/trigger/outlook-webhook-subscriptions.ts?${cacheBuster}`
    );

    expect(resolveOutlookWebhookUrl()).toBe(
      "https://webhooks.example.com/functions/v1/outlook-webhook"
    );
  });

  test("shouldRenewSubscription renews invalid or near-expiry timestamps", async () => {
    const cacheBuster = `outlook-sub-renew-${Date.now()}-${Math.random()}`;
    const { shouldRenewSubscription } = await import(
      `../../../apps/trigger-dev/src/trigger/outlook-webhook-subscriptions.ts?${cacheBuster}`
    );

    const now = new Date("2026-02-26T16:00:00.000Z");
    expect(shouldRenewSubscription("not-a-date", now)).toBe(true);
    expect(shouldRenewSubscription("2026-02-26T16:20:00.000Z", now, 60)).toBe(
      true
    );
    expect(shouldRenewSubscription("2026-02-26T20:00:00.000Z", now, 60)).toBe(
      false
    );
  });

  test("task definitions expose expected IDs and schedule", async () => {
    const cacheBuster = `outlook-sub-task-${Date.now()}-${Math.random()}`;
    const { outlookWebhookSubscriptions, outlookWebhookSubscriptionsSync } =
      await import(
        `../../../apps/trigger-dev/src/trigger/outlook-webhook-subscriptions.ts?${cacheBuster}`
      );

    expect((outlookWebhookSubscriptions as { id?: string }).id).toBe(
      "outlook-webhook-subscriptions"
    );
    expect((outlookWebhookSubscriptions as { cron?: string }).cron).toBe(
      "*/30 * * * *"
    );
    expect((outlookWebhookSubscriptionsSync as { id?: string }).id).toBe(
      "outlook-webhook-subscriptions-sync"
    );
  });
});
