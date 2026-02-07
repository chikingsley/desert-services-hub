#!/usr/bin/env bun

/**
 * Register Monday.com webhooks for the ESTIMATING board.
 *
 * Run AFTER the Cloudflare tunnel is live and the web server is running.
 *
 * Usage:
 *   bun apps/workers/estimate-poller/setup-webhooks.ts --url=https://your-tunnel.cfargotunnel.com
 *   bun apps/workers/estimate-poller/setup-webhooks.ts --list
 *   bun apps/workers/estimate-poller/setup-webhooks.ts --delete=WEBHOOK_ID
 */
import { createWebhook, deleteWebhook, listWebhooks } from "@monday/client";
import type { WebhookEventType } from "@monday/types";
import { BOARD_IDS } from "@monday/types";

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith("--url="));
const listFlag = args.includes("--list");
const deleteArg = args.find((a) => a.startsWith("--delete="));

const BOARD_ID = BOARD_IDS.ESTIMATING;

const WEBHOOK_EVENTS: WebhookEventType[] = [
  "change_status_column_value",
  "create_item",
  "change_column_value",
  "change_name",
];

async function list(): Promise<void> {
  const webhooks = await listWebhooks(BOARD_ID);

  if (webhooks.length === 0) {
    console.log("No webhooks registered on ESTIMATING board.");
    return;
  }

  console.log(`${webhooks.length} webhook(s) on ESTIMATING board:\n`);
  for (const wh of webhooks) {
    console.log(
      `  ID: ${wh.id}  Event: ${wh.event}  Config: ${wh.config ?? "(none)"}`
    );
  }
}

async function setup(baseUrl: string): Promise<void> {
  const webhookUrl = `${baseUrl}/api/webhooks/monday`;

  console.log(`Registering webhooks on ESTIMATING board (${BOARD_ID})`);
  console.log(`Target URL: ${webhookUrl}\n`);

  // Check existing
  const existing = await listWebhooks(BOARD_ID);
  const existingEvents = new Set(existing.map((w) => w.event));

  for (const event of WEBHOOK_EVENTS) {
    if (existingEvents.has(event)) {
      console.log(`  [skip] ${event} — already registered`);
      continue;
    }

    const wh = await createWebhook({
      boardId: BOARD_ID,
      url: webhookUrl,
      event,
    });

    console.log(`  [created] ${event} → webhook ID ${wh.id}`);
  }

  console.log("\nDone.");
}

async function remove(webhookId: string): Promise<void> {
  const wh = await deleteWebhook(webhookId);
  console.log(`Deleted webhook ${wh.id} from board ${wh.board_id}`);
}

if (listFlag) {
  await list();
} else if (deleteArg) {
  const id = deleteArg.split("=")[1];
  if (!id) {
    console.error("Usage: --delete=WEBHOOK_ID");
    process.exit(1);
  }
  await remove(id);
} else if (urlArg) {
  const url = urlArg.split("=").slice(1).join("=");
  if (!url) {
    console.error("Usage: --url=https://your-tunnel-url");
    process.exit(1);
  }
  await setup(url);
} else {
  console.log("Usage:");
  console.log("  --url=https://...   Register webhooks pointing at this URL");
  console.log(
    "  --list              List existing webhooks on ESTIMATING board"
  );
  console.log("  --delete=ID         Delete a webhook by ID");
}
