#!/usr/bin/env bun
/**
 * Manage Outlook Change Notification Subscriptions
 *
 * Usage:
 *   bun packages/email/cli/manage-subscriptions.ts create --all
 *   bun packages/email/cli/manage-subscriptions.ts create --mailbox=chi@desertservices.net
 *   bun packages/email/cli/manage-subscriptions.ts list
 *   bun packages/email/cli/manage-subscriptions.ts renew
 *   bun packages/email/cli/manage-subscriptions.ts delete --all
 *   bun packages/email/cli/manage-subscriptions.ts status
 */
import {
  createMailboxSubscription,
  deleteAllSubscriptions,
  ensureAllSubscriptions,
  listSubscriptions,
  renewExpiring,
} from "@email/subscriptions";
import { createGraphClient } from "@email/sync/config";

const args = process.argv.slice(2);
const command = args[0];

const TRAILING_SLASH_RE = /\/$/;
const OUTLOOK_WEBHOOK_PATH = "/functions/v1/outlook-webhook";

function getFlag(name: string): string | undefined {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag?.split("=")[1];
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function getWebhookUrl(): string {
  const url = getFlag("url") ?? process.env.WEBHOOK_BASE_URL;

  if (!url) {
    console.error(
      "Error: Provide --url=https://... or set WEBHOOK_BASE_URL env var"
    );
    process.exit(1);
  }

  return `${url.replace(TRAILING_SLASH_RE, "")}${OUTLOOK_WEBHOOK_PATH}`;
}

async function main(): Promise<void> {
  switch (command) {
    case "create": {
      const webhookUrl = getWebhookUrl();

      if (hasFlag("all")) {
        console.log("Creating subscriptions for all mailboxes...");
        console.log(`Webhook URL: ${webhookUrl}\n`);
        const result = await ensureAllSubscriptions(webhookUrl);
        console.log(
          `\nDone: ${result.created} created, ${result.existing} existing, ${result.failed} failed`
        );
      } else {
        const mailbox = getFlag("mailbox");
        if (!mailbox) {
          console.error(
            "Usage: create --all  OR  create --mailbox=chi@desertservices.net"
          );
          process.exit(1);
        }
        console.log(`Creating subscription for ${mailbox}...`);
        console.log(`Webhook URL: ${webhookUrl}`);
        const client = createGraphClient();
        const sub = await createMailboxSubscription(
          client,
          mailbox,
          webhookUrl
        );
        console.log(
          `Created: ${sub.subscription_id} (expires ${sub.expiration})`
        );
      }
      break;
    }

    case "list": {
      const subs = await listSubscriptions();
      if (subs.length === 0) {
        console.log("No active subscriptions.");
        return;
      }

      console.log(`${subs.length} subscription(s):\n`);
      for (const sub of subs) {
        const expiry = new Date(sub.expiration);
        const hoursLeft = Math.round(
          (expiry.getTime() - Date.now()) / (60 * 60 * 1000)
        );
        let status = "active";
        if (hoursLeft <= 0) {
          status = "EXPIRED";
        } else if (hoursLeft <= 24) {
          status = "EXPIRING SOON";
        }
        console.log(`  ${sub.mailbox_email}`);
        console.log(`    ID: ${sub.subscription_id}`);
        console.log(
          `    Expires: ${sub.expiration} (${hoursLeft}h remaining) [${status}]`
        );
        if (sub.renewed_at) {
          console.log(`    Last renewed: ${sub.renewed_at}`);
        }
        console.log();
      }
      break;
    }

    case "renew": {
      const hours = Number(getFlag("hours") ?? "24");
      console.log(`Renewing subscriptions expiring within ${hours} hours...`);
      const result = await renewExpiring(hours);
      console.log(`Done: ${result.renewed} renewed, ${result.failed} failed`);
      break;
    }

    case "delete": {
      if (!hasFlag("all")) {
        console.error("Usage: delete --all");
        process.exit(1);
      }
      console.log("Deleting all subscriptions...");
      const deleted = await deleteAllSubscriptions();
      console.log(`Deleted ${deleted} subscription(s)`);
      break;
    }

    case "status": {
      const subs = await listSubscriptions();
      const now = Date.now();
      const active = subs.filter((s) => new Date(s.expiration).getTime() > now);
      const expired = subs.filter(
        (s) => new Date(s.expiration).getTime() <= now
      );
      const expiringSoon = active.filter(
        (s) => new Date(s.expiration).getTime() - now < 24 * 60 * 60 * 1000
      );

      console.log("Outlook Subscriptions Status");
      console.log(`  Total:         ${subs.length}`);
      console.log(`  Active:        ${active.length}`);
      console.log(`  Expiring <24h: ${expiringSoon.length}`);
      console.log(`  Expired:       ${expired.length}`);

      if (expiringSoon.length > 0) {
        console.log("\nExpiring soon:");
        for (const sub of expiringSoon) {
          const hoursLeft = Math.round(
            (new Date(sub.expiration).getTime() - now) / (60 * 60 * 1000)
          );
          console.log(`  ${sub.mailbox_email} (${hoursLeft}h remaining)`);
        }
      }
      break;
    }

    default: {
      console.log(`Outlook Subscription Manager

Commands:
  create --all                              Create subs for all 36 mailboxes
  create --mailbox=chi@desertservices.net    Create sub for one mailbox
  list                                      List all subscriptions
  renew [--hours=24]                        Renew expiring subscriptions
  delete --all                              Delete all subscriptions
  status                                    Show subscription health

Options:
  --url=https://...    Override edge base URL (or set WEBHOOK_BASE_URL)`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
