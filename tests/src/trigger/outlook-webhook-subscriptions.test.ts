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

  test("resolveWebhookUrl prefers explicit OUTLOOK_WEBHOOK_URL", async () => {
    process.env.OUTLOOK_WEBHOOK_URL = "https://hooks.example.com/outlook";
    process.env.WEBHOOK_BASE_URL = "https://ignored.example.com";

    const cacheBuster = `outlook-sub-url-explicit-${Date.now()}-${Math.random()}`;
    const { resolveWebhookUrl } = await import(
      `../../../apps/trigger-dev/src/trigger/outlook-webhook-subscriptions.ts?${cacheBuster}`
    );

    expect(resolveWebhookUrl()).toBe(
      "https://hooks.example.com/outlook"
    );
  });

  test("resolveWebhookUrl builds from WEBHOOK_BASE_URL and strips trailing slashes", async () => {
    process.env.WEBHOOK_BASE_URL = "https://webhooks.example.com/";

    const cacheBuster = `outlook-sub-url-base-${Date.now()}-${Math.random()}`;
    const { resolveWebhookUrl } = await import(
      `../../../apps/trigger-dev/src/trigger/outlook-webhook-subscriptions.ts?${cacheBuster}`
    );

    expect(resolveWebhookUrl()).toBe(
      "https://webhooks.example.com/functions/v1/outlook-webhook"
    );
  });

  test("shouldRenew returns true for invalid or near-expiry timestamps", async () => {
    const cacheBuster = `outlook-sub-renew-${Date.now()}-${Math.random()}`;
    const { shouldRenew } = await import(
      `../../../apps/trigger-dev/src/trigger/outlook-webhook-subscriptions.ts?${cacheBuster}`
    );

    const now = new Date("2026-02-26T16:00:00.000Z");
    // Invalid date → always renew
    expect(shouldRenew("not-a-date", now)).toBe(true);
    // Expires in 20 min, buffer is 60 min → renew
    expect(shouldRenew("2026-02-26T16:20:00.000Z", now)).toBe(true);
    // Expires in 4 hours, buffer is 60 min → skip
    expect(shouldRenew("2026-02-26T20:00:00.000Z", now)).toBe(false);
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
      "0 */6 * * *"
    );
    expect((outlookWebhookSubscriptionsSync as { id?: string }).id).toBe(
      "outlook-webhook-subscriptions-sync"
    );
  });
});
